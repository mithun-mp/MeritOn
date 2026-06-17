
# Google Sheets to CSV Export Instructions

To export data from your Google Sheets backend:

## Steps

1. Open the Google Sheets spreadsheet containing your MeritOn CBT data
2. For each tab listed below:
   a. Click on the tab
   b. Go to `File` → `Download` → `Comma-separated values (.csv, current sheet)`
   c. Save the downloaded file
   d. Rename the file to the exact filename listed
   e. Move the file to `backend-node/migration-data/`

## Tabs to Export

| Google Sheets Tab | Save As Filename |
|------------------|-------------------|
| Admin | Admin.csv |
| Tests | Tests.csv |
| Questions | Questions.csv |
| Performance | Performance.csv |
| Responses | Responses.csv |
| ErrorLogs | ErrorLogs.csv |
| AuditLogs | AuditLogs.csv |

## Notes

- Make sure to export **all rows including headers (first row)
- Do not modify the CSV files after downloading
- The migration script uses the first row as field names, which must match the original Apps Script sheet headers
