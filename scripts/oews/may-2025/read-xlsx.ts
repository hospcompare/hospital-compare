import { strFromU8, unzipSync } from "fflate";
import { OewsAdapterError } from "./errors";

export type SheetRow = {
  excelRow: number;
  cells: Record<string, string>;
};

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

function zipEntries(bytes: Uint8Array) {
  try {
    return unzipSync(bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new OewsAdapterError(`Unable to read ZIP archive: ${message}`);
  }
}

function entryText(
  entries: Record<string, Uint8Array>,
  path: string,
  label: string,
) {
  const bytes = entries[path];
  if (!bytes) {
    throw new OewsAdapterError(`${label} is missing ${path}`);
  }
  return strFromU8(bytes);
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

function dataSheetPath(entries: Record<string, Uint8Array>, label: string) {
  const workbook = entryText(entries, "xl/workbook.xml", label);
  const rels = entryText(entries, "xl/_rels/workbook.xml.rels", label);
  const targets = new Map<string, string>();

  for (const relationship of rels.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const id = attribute(relationship[1], "Id");
    const target = attribute(relationship[1], "Target");
    if (id && target) {
      targets.set(id, sheetPath(target));
    }
  }

  const sheets: { name: string; path: string }[] = [];
  for (const sheet of workbook.matchAll(/<sheet\b([^>]*)\/>/g)) {
    const name = attribute(sheet[1], "name");
    const id = attribute(sheet[1], "r:id");
    if (!name || !id) {
      continue;
    }
    const path = targets.get(id);
    if (!path) {
      throw new OewsAdapterError(
        `${label} workbook sheet ${name} has no worksheet target`,
      );
    }
    if (name.endsWith("_dl")) {
      sheets.push({ name, path });
    }
  }

  if (sheets.length !== 1) {
    throw new OewsAdapterError(
      `${label} must contain exactly one *_dl data sheet; found ${sheets.length}`,
    );
  }

  return sheets[0];
}

function columnLetters(cellRef: string) {
  const match = /^([A-Z]+)/.exec(cellRef);
  if (!match) {
    throw new OewsAdapterError(`Invalid worksheet cell reference ${cellRef}`);
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
    const index = Number(text);
    const shared = sharedStrings[index];
    if (shared === undefined) {
      throw new OewsAdapterError(`Shared string index ${text} is missing`);
    }
    return shared;
  }
  return text;
}

function parseRowXml(rowXml: string, sharedStrings: string[]) {
  const rowTag = /^<row\b([^>]*)>/.exec(rowXml);
  if (!rowTag) {
    throw new OewsAdapterError("Worksheet row is missing its row tag");
  }
  const excelRow = Number(attribute(rowTag[1], "r") ?? "");
  if (!Number.isInteger(excelRow) || excelRow < 1) {
    throw new OewsAdapterError("Worksheet row number is missing");
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

export function forEachDataSheetRow(
  xlsxBytes: Uint8Array,
  label: string,
  visit: (row: SheetRow) => void,
) {
  const entries = zipEntries(xlsxBytes);
  const sheet = dataSheetPath(entries, label);
  const sharedStrings = entries["xl/sharedStrings.xml"]
    ? parseSharedStrings(strFromU8(entries["xl/sharedStrings.xml"]))
    : [];
  const sheetXml = entryText(entries, sheet.path, label);
  let searchFrom = 0;

  while (searchFrom < sheetXml.length) {
    const start = sheetXml.indexOf("<row", searchFrom);
    if (start < 0) {
      break;
    }
    const end = sheetXml.indexOf("</row>", start);
    if (end < 0) {
      throw new OewsAdapterError(`${label} has an unclosed worksheet row`);
    }
    visit(parseRowXml(sheetXml.slice(start, end), sharedStrings));
    searchFrom = end + "</row>".length;
  }
}

export function readZipEntries(zipBytes: Uint8Array) {
  const entries = zipEntries(zipBytes);
  const byFileName = new Map<string, Uint8Array>();
  for (const [path, bytes] of Object.entries(entries)) {
    const fileName = path.split("/").pop() ?? path;
    if (fileName.endsWith(".xlsx")) {
      byFileName.set(fileName, bytes);
    }
  }
  return byFileName;
}
