export default {
	async fetch(request, env) {
		async function getChatGPTResponse(conversation) {
			const body = {
				model: 'gpt-3.5-turbo',
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

			return result.choices[0].message.content;
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
				bot_id: env.BOT_ID,
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
			console.log(body);
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
			const starterPrompt = 'You are a helpful assistant named DinoBot.';
			let conversation = [];
			if (json.attachments.length > 0) {
				conversation = await getResponseChain(json.attachments);
			}

			conversation.push([json.text, json.user_id]);

			const chatFormat = createChatFormat(conversation);
			chatFormat.unshift({ role: 'system', content: starterPrompt });
			const response = await getChatGPTResponse(chatFormat);
			await postGroupmeMessage(response, json.id, json.user_id);
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
					(words[1].includes('dinobot') && ['hey', 'hi', 'yo', 'hello'].includes(words[0]))
				) {
					console.log('command triggered');
					await processGroupmeMessage(respJson);
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
