export default {
	async fetch(request, env, context) {
		async function getChatGPTResponse(conversation) {
			const body = {
				model: 'gpt-4',
				temperature: 0.7,
				max_tokens: 4000,
				messages: conversation,
			};

			const init = {
				method: 'POST',
				headers: {
					'Authorization': 'Bearer ' + env.OPENAI_TOKEN,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(body),
			};
			const response = await fetch('https://api.openai.com/v1/chat/completions', init);

			const result = await response.json();

			let message = result.choices[0].message.content;

			const substringsToReplace = [
				'an ai language model',
				'an ai chatbot',
				'an ai assistant',
				'a chatbot',
				'a playful assistant',
				'a virtual assistant',
			];
			const replacementString = 'a dinosaur';
			if (!env.CODECHAT) {
				const regex = new RegExp(substringsToReplace.join('|'), 'gi');
				message = message.replace(regex, replacementString);
			}

			return message;
		}
		function createChatFormat(conversation) {
			let chatFormat = [];
			for (const message of conversation) {
				const role = message[1] === env.BOT_USER_ID ? 'system' : 'user';
				chatFormat.push({ role: role, content: message[0] });
			}
			return chatFormat;
		}

		async function postGroupmeMessage(message, reply_id = False, reply_user = False) {
			let body = {
				bot_id: env.BOT_TOKEN,
				text: message,
			};
			if (reply_id && reply_user) {
				body['attachments'] = [
					{
						type: 'reply',
						user_id: reply_user,
						reply_id: reply_id,
						base_reply_id: reply_id,
					},
				];
			}
			const init = {
				method: 'POST',
				headers: {
					'X-Access-Token': env.GROUPME_ACCESS_TOKEN,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(body),
			};
			const url = `https://api.groupme.com/v3/bots/post`;
			await fetch(url, init);
		}

		async function getGroupmeMessage(messageId) {
			const init = {
				headers: {
					'X-Access-Token': env.GROUPME_ACCESS_TOKEN,
				},
			};
			const url = `https://api.groupme.com/v3/groups/${env.GROUP_ID}/messages/${messageId}`;
			const response = await fetch(url, init);
			const json = await response.json();
			return json.response.message;
		}

		/**
		 * This code gets the last message
		 * From the GroupMe API
		 * With a fetch and some JSON
		 * It'll make sure you don't miss
		 */
		async function getLastGroupmeMessage() {
			const init = {
				headers: {
					'X-Access-Token': env.GROUPME_ACCESS_TOKEN,
				},
			};
			const url = `https://api.groupme.com/v3/groups/${env.GROUP_ID}/messages?limit=1`;
			const response = await fetch(url, init);
			const json = await response.json();

			return json.response.messages[0];
		}

		async function recr_getResponseChain(attachments) {
			let conversation = [];
			for (const attachment of attachments) {
				const message = await getGroupmeMessage(attachment.reply_id);
				conversation.push([message.text, message.user_id]);
				if (message.attachments.length > 0) {
					const more_replies = await recr_getResponseChain(message.attachments);
					for (const reply of more_replies) {
						conversation.push(reply);
					}
				}
				return conversation;
			}
		}

		async function getResponseChain(attachments) {
			const responseChain = await recr_getResponseChain(attachments);
			return responseChain.reverse();
		}

		async function processGroupmeMessage(json) {
			let conversation = [];
			if (json.attachments.length > 0) {
				conversation = await getResponseChain(json.attachments);
			}

			conversation.push([json.text, json.user_id]);

			const chatFormat = createChatFormat(conversation);
			// chatgpt wrote the date part lol
			const date = new Date();
			const options = {
				timeZone: 'America/New_York',
				month: 'numeric',
				day: 'numeric',
				year: 'numeric',
				hour: 'numeric',
				minute: 'numeric',
				hour12: true,
				timeZoneName: 'short',
			};
			const time = date.toLocaleString('en-US', options);

			const starterPrompt =
				env.STARTER_PROMPT +
				`You are currently responding to a user named ${json.name}. The current date and time is ${time}`;
			chatFormat.unshift({ role: 'system', content: starterPrompt });

			const response = await getChatGPTResponse(chatFormat);

			const maxLength = 1000;

			if (response.length >= maxLength) {
				// this splits up message into chunks of 1000 char without breaking up words
				const messageList = response.match(/\b.{1,1000}\b/gs);
				let replyingToBot = false;

				for (const message of messageList) {
					if (replyingToBot) {
						let lastMessage = await getLastGroupmeMessage();
						await postGroupmeMessage(message, lastMessage.id, lastMessage.user_id);
					} else {
						await postGroupmeMessage(message, json.id, json.user_id);
						replyingToBot = true;
					}
				}
			} else {
				console.log('normal msg');
				await postGroupmeMessage(response, json.id, json.user_id);
			}
		}

		if (request.method === 'POST') {
			const contentType = request.headers.get('content-type');
			if (contentType.includes('application/json')) {
				const respJson = await request.json();
				let isAReply;
				if (respJson.sender_type !== 'user') {
					console.log('not a user, skipping');
					return new Response('not a user');
				}
				//if has attachment
				if (respJson.attachments.length > 0) {
					const message = await getGroupmeMessage(respJson.id);
					for (const attachment of message.attachments) {
						console.log(attachment);
						if (attachment.type === 'reply') {
							console.log(`${attachment.user_id} equal ${env.BOT_USER_ID}?`);
							if (attachment.user_id != env.BOT_USER_ID) {
								console.log('non bot reply');
								return new Response('non bot reply');
							}
							isAReply = true;
							break;
						}
					}
				}

				const message = respJson.text.toLowerCase();
				const words = message.split(' ');

				if (
					isAReply ||
					words[0].includes('dinobot') ||
					(words.length > 1 &&
						words[1].includes('dinobot') &&
						['hey', 'hi', 'yo', 'hello'].includes(words[0])) ||
					env.CODECHAT
				) {
					console.log('command triggered');
					context.waitUntil(processGroupmeMessage(respJson));
				} else {
					console.log('not triggered');
				}

				return new Response('ok');
			}
		} else if (request.method === 'GET') {
			return new Response('The request was a GET');
		}
	},
};
