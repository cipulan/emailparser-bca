import PostalMime from 'postal-mime';

interface Env {
	TELEGRAM_BOT_TOKEN: string;
	TELEGRAM_CHAT_ID: string;
}

export default {
	async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
		const telegramBotToken = env.TELEGRAM_BOT_TOKEN;
		const telegramChatId = env.TELEGRAM_CHAT_ID;

		if (!telegramBotToken || !telegramChatId) {
			console.error('Missing Telegram configuration');
			return;
		}

		try {
			const parser = new PostalMime();
			const email = await parser.parse(message.raw);

			// Check for forwarded content
			const forwarded = parseForwardedMail(email.text || email.html || '');

			// Use original details if available, otherwise fall back to current email headers
			const subject = forwarded.subject || email.subject || '(No Subject)';
			const from = forwarded.from || (email.from ? `${email.from.name} <${email.from.address}>` : '(Unknown Sender)');
			// const date = forwarded.date ? forwarded.date : ''; 

			// Extract transaction details if available
			const td = parseTransactionDetails(email.html || email.text || '');

			let telegramMessage = `📧 *${escapeMarkdown(from)}*\n\n` +
				`*Subject:* ${escapeMarkdown(subject)}\n` +
				`\n` +
				`*Detail Transaksi:*\n` +
				`*Nomor Customer:* ${escapeMarkdown(td.nomorCustomer)}\n` +
				`*Nomor Kartu:* ${escapeMarkdown(td.nomorKartu)}\n` +
				`*Merchant / ATM:* ${escapeMarkdown(td.merchant)}\n` +
				`*Jenis Transaksi:* ${escapeMarkdown(td.jenisTransaksi)}\n` +
				`*Otentikasi:* ${escapeMarkdown(td.otentikasi)}\n` +
				`*Pada Tanggal:* ${escapeMarkdown(td.padaTanggal)}\n` +
				`*Sejumlah:* ${escapeMarkdown(td.sejumlah)}`;

			await sendToTelegram(telegramBotToken, telegramChatId, telegramMessage);

		} catch (error) {
			console.error('Error parsing email or sending to Telegram:', error);
			// Optional: send error notification to Telegram or log it
		}
	}
};

export function parseTransactionDetails(html: string) {
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

function parseForwardedMail(content: string): { from?: string, subject?: string, date?: string } {
	let from, subject, date;

	// Regex for "From" / "Dari" in forwarded block
	// Matches "Dari: ... <...>" or "From: ... <...>"
	const fromMatch = content.match(/(?:Dari|From):\s*(.*?)(?:\r?\n|<br>)/i);
	if (fromMatch && fromMatch[1]) {
		from = fromMatch[1].trim();
		// Clean up HTML tags if present (simple check)
		from = from.replace(/<[^>]*>/g, '').trim();
	}

	// Regex for "Date" / "Tanggal"
	const dateMatch = content.match(/(?:Date|Tanggal|Sent):\s*(.*?)(?:\r?\n|<br>)/i);
	if (dateMatch && dateMatch[1]) {
		date = dateMatch[1].trim();
		date = date.replace(/<[^>]*>/g, '').trim();
	}

	// Regex for "Subject"
	const subjectMatch = content.match(/Subject:\s*(.*?)(?:\r?\n|<br>)/i);
	if (subjectMatch && subjectMatch[1]) {
		subject = subjectMatch[1].trim();
		subject = subject.replace(/<[^>]*>/g, '').trim();
	}

	return { from, subject, date };
}

async function sendToTelegram(token: string, chatId: string, text: string) {
	const url = `https://api.telegram.org/bot${token}/sendMessage`;
	const body = {
		chat_id: chatId,
		text: text,
		parse_mode: 'Markdown'
	};

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.error(`Telegram API error: ${response.status} ${response.statusText} - ${errorText}`);
	}
}

function escapeMarkdown(text: string): string {
	// Escape characters for MarkdownV2 if we used V2, but for standard Markdown in Telegram (v1 legacy) 
	// it's less strict. However, the user might simply use 'Markdown'.
	// 'Markdown' (v1) supports *bold*, _italic_, [text](url). 
	// It's safer to avoid conflicting markdown characters if we aren't strict.
	// For simplicity with 'Markdown' mode:
	return text.replace(/[_*`\[]/g, '\\$&');
}
