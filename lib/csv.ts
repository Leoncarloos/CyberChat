const BOM = "﻿";

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsvRow(fields: (string | number | null | undefined)[]): string {
  return fields.map((f) => escapeCsvField(f === null || f === undefined ? "" : String(f))).join(",");
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return BOM + rows.map(toCsvRow).join("\r\n") + "\r\n";
}
