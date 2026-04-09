// Import scraped data into SQLite database
// Usage: node import_data.js [letpub_full.json] [conferences.json]
const fs = require('fs');
const path = require('path');

const LETPUB_FILE = process.argv[2] || path.join(__dirname, '..', 'data', 'letpub_full.json');
const CONFERENCES_FILE = process.argv[3] || path.join(__dirname, '..', 'data', 'all_conferences_correct.json');

function main() {
    console.log('Importing data...');
    console.log('LetPub file:', LETPUB_FILE);
    console.log('Conferences file:', CONFERENCES_FILE);

    // Load data
    const letpubData = fs.existsSync(LETPUB_FILE)
        ? JSON.parse(fs.readFileSync(LETPUB_FILE, 'utf8'))
        : [];
    const conferencesData = fs.existsSync(CONFERENCES_FILE)
        ? JSON.parse(fs.readFileSync(CONFERENCES_FILE, 'utf8'))
        : {};

    console.log(`LetPub entries: ${letpubData.length}`);
    const confEntries = Object.entries(conferencesData).flatMap(([domain, entries]) => entries);
    console.log(`Conference entries: ${confEntries.length}`);

    // Generate a JSON file that the Go server can import directly
    const importData = {
        journals: letpubData,
        conferences: Object.entries(conferencesData).flatMap(([domain, entries]) =>
            entries.map(e => ({ ...e, domain }))
        )
    };
    const jsonOutputPath = path.join(__dirname, '..', 'server', 'db', 'import_data.json');
    fs.writeFileSync(jsonOutputPath, JSON.stringify(importData, null, 2));
    console.log(`Generated import JSON: ${jsonOutputPath}`);
    console.log(`Total entries: ${importData.journals.length + importData.conferences.length}`);
}

main();
