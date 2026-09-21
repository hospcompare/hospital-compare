import { strFromU8, unzipSync } from "fflate";
import type { SheetRow } from "./types";

function decodeXml(text: string) {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll(/&#(\d+);/g, (_, digits: string) =>
      String.fromCodePoint(Number(digits)),
    )
    .replaceAll(/&#x([0-9a-fA-F]+);/g, (_, digits: string) =>
      String.fromCodePoint(Number.parseInt(digits, 16)),
    )
    .replaceAll("&amp;", "&");
}

function attribute(tag: string, name: string) {
  const pattern = new RegExp(
    `(?:^|\\s)${name.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}="([^"]*)"`,
  );
  const match = pattern.exec(tag);
  return match ? decodeXml(match[1]) : null;
}

function parseSharedStrings(xml: string) {
  const strings: string[] = [];
  const itemPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  for (const item of xml.matchAll(itemPattern)) {
    const texts = [...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(
      (match) => decodeXml(match[1]),
    );
    strings.push(texts.join(""));
  }
  return strings;
}

function sheetPath(target: string) {
  const normalized = target.replaceAll("\\", "/").replace(/^\//, "");
  if (normalized.startsWith("xl/")) {
    return normalized;
  }
  return `xl/${normalized.replace(/^\.\.\//, "")}`;
}

function firstSheetPath(entries: Record<string, Uint8Array>, label: string) {
  const workbook = entries["xl/workbook.xml"];
  const rels = entries["xl/_rels/workbook.xml.rels"];
  if (!workbook || !rels) {
    throw new Error(`${label} is missing workbook metadata`);
  }
  const workbookXml = strFromU8(workbook);
  const relsXml = strFromU8(rels);
  const targets = new Map<string, string>();
  for (const relationship of relsXml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const id = attribute(relationship[1], "Id");
    const target = attribute(relationship[1], "Target");
    if (id && target) {
      targets.set(id, sheetPath(target));
    }
  }
  const sheet = /<sheet\b([^>]*)\/>/.exec(workbookXml);
  if (!sheet) {
    throw new Error(`${label} has no worksheet`);
  }
  const id = attribute(sheet[1], "r:id");
  const path = id ? targets.get(id) : undefined;
  if (!path || !entries[path]) {
    throw new Error(`${label} first worksheet is missing`);
  }
  return path;
}

function columnLetters(cellRef: string) {
  const match = /^([A-Z]+)/.exec(cellRef);
  if (!match) {
    throw new Error(`Invalid worksheet cell reference ${cellRef}`);
  }
  return match[1];
}

function cellValue(body: string, type: string | null, sharedStrings: string[]) {
  if (type === "inlineStr") {
    return [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((match) => decodeXml(match[1]))
      .join("");
  }
  const value = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body);
  if (!value) {
    return "";
  }
  const text = decodeXml(value[1].trim());
  if (type === "s") {
    const shared = sharedStrings[Number(text)];
    if (shared === undefined) {
      throw new Error(`Shared string index ${text} is missing`);
    }
    return shared;
  }
  return text;
}

function parseRowXml(rowXml: string, sharedStrings: string[]): SheetRow {
  const rowTag = /^<row\b([^>]*)>/.exec(rowXml);
  if (!rowTag) {
    throw new Error("Worksheet row is missing its row tag");
  }
  const excelRow = Number(attribute(rowTag[1], "r") ?? "");
  if (!Number.isInteger(excelRow) || excelRow < 1) {
    throw new Error("Worksheet row number is missing");
  }
  const cells: Record<string, string> = {};
  const cellPattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  for (const cell of rowXml.matchAll(cellPattern)) {
    const ref = attribute(cell[1], "r");
    if (!ref) {
      continue;
    }
    cells[columnLetters(ref)] = cellValue(
      cell[2] ?? "",
      attribute(cell[1], "t"),
      sharedStrings,
    );
  }
  return { excelRow, cells };
}

/** Read every row of the first worksheet. Does not require an OEWS *_dl sheet. */
export function readFirstSheetRows(xlsxBytes: Uint8Array, label: string): SheetRow[] {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(xlsxBytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read ${label}: ${message}`);
  }
  const path = firstSheetPath(entries, label);
  const sharedStrings = entries["xl/sharedStrings.xml"]
    ? parseSharedStrings(strFromU8(entries["xl/sharedStrings.xml"]))
    : [];
  const sheetXml = strFromU8(entries[path]);
  const rows: SheetRow[] = [];
  let searchFrom = 0;
  while (searchFrom < sheetXml.length) {
    const start = sheetXml.indexOf("<row", searchFrom);
    if (start < 0) {
      break;
    }
    const end = sheetXml.indexOf("</row>", start);
    if (end < 0) {
      throw new Error(`${label} has an unclosed worksheet row`);
    }
    rows.push(parseRowXml(sheetXml.slice(start, end), sharedStrings));
    searchFrom = end + "</row>".length;
  }
  return rows;
}
