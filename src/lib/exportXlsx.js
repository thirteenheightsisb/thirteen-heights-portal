// sheets: { 'Sheet name': [ {col: value, ...}, ... ] }
export async function exportToExcel(sheets, filename) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No records' }])
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
  }
  XLSX.writeFile(wb, filename)
}
