import PostalMime from 'postal-mime';
import * as fs from 'fs';
import * as path from 'path';


function parseTransactionDetails(html: string) {
    // Defaults
    const result = {
        nomorCustomer: 'N/A',
        nomorKartu: 'N/A',
        merchant: 'N/A',
        jenisTransaksi: 'N/A',
        otentikasi: 'N/A',
        padaTanggal: 'N/A',
        sejumlah: 'N/A'
    };

    if (!html) return result;

    // Helper to extract value based on label
    // Structure: <td>Label</td> ... <td>:</td> ... <td><span>Value</td>
    // We match Label, skip intermediate tags until the value cell.
    const extractValue = (label: string) => {
        // Regex explanation:
        // 1. Match the label text
        // 2. Match closing td and subsequent html until the value cell
        // 3. The value is usually in the 3rd td (Label -> Sep -> Value)

        // Escape special regex chars in label (like /)
        const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const regex = new RegExp(`${escapedLabel}\\s*<\\/td>[\\s\\S]*?<td[^>]*>[\\s\\S]*?<\\/td>[\\s\\S]*?<td[^>]*>(?:<span>)?([\\s\\S]*?)(?:<\\/span>)?(?:<\\/td>|$)`, 'i');
        const match = html.match(regex);
        if (match && match[1]) {
            return match[1].replace(/<[^>]*>/g, '').trim();
        }
        return 'N/A';
    };

    result.nomorCustomer = extractValue('Nomor Customer');
    result.nomorKartu = extractValue('Nomor Kartu');
    result.merchant = extractValue('Merchant / ATM');
    result.jenisTransaksi = extractValue('Jenis Transaksi');
    result.otentikasi = extractValue('Otentikasi');
    result.padaTanggal = extractValue('Pada Tanggal');
    result.sejumlah = extractValue('Sejumlah');

    return result;
}


// Only for testing/mocking the internal function since it's not exported
function parseForwardedMail(content: string): { from?: string, subject?: string, date?: string } {
    let from, subject, date;
    const fromMatch = content.match(/(?:Dari|From):\s*(.*?)(?:\r?\n|<br>)/i);
    if (fromMatch && fromMatch[1]) from = fromMatch[1].trim().replace(/<[^>]*>/g, '').trim();
    const dateMatch = content.match(/(?:Date|Tanggal|Sent):\s*(.*?)(?:\r?\n|<br>)/i);
    if (dateMatch && dateMatch[1]) date = dateMatch[1].trim().replace(/<[^>]*>/g, '').trim();
    const subjectMatch = content.match(/Subject:\s*(.*?)(?:\r?\n|<br>)/i);
    if (subjectMatch && subjectMatch[1]) subject = subjectMatch[1].trim().replace(/<[^>]*>/g, '').trim();
    return { from, subject, date };
}

async function test() {
    // Test with the Forwarded email
    const emlPath = path.join(process.cwd(), 'Credit Card Transaction Notification.eml');

    if (!fs.existsSync(emlPath)) {
        console.error(`Error: Could not find email file at ${emlPath}`);
        process.exit(1);
    }

    console.log(`Reading email from: ${emlPath}`);
    const emlContent = fs.readFileSync(emlPath);

    const parser = new PostalMime();
    const email = await parser.parse(emlContent);

    console.log('Parsing content...');

    // Test Forwarded Headers
    const forwarded = parseForwardedMail(email.text || email.html || '');
    console.log('--- Forwarded Headers ---');
    console.log(JSON.stringify(forwarded, null, 2));

    // Test Transaction Details
    const extracted = parseTransactionDetails(email.html || email.text || '');

    console.log('--- Extracted Data ---');
    console.log(JSON.stringify(extracted, null, 2));
}

test().catch(console.error);
