import Link from "next/link";

export default function HospitalNotFound() {
  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-16 text-center">
      <h1 className="font-heading text-3xl">No production hospital for that CCN</h1>
      <p className="text-muted-foreground">
        The identifier is missing from the hospitals table. Staging agent payloads are not
        published here.
      </p>
      <Link href="/hospitals" className="text-teal-800 hover:underline">
        Back to search
      </Link>
    </div>
  );
}
