# ChatMe

a groupme chatbot for chatgpt!

## Instructions

- create a groupme bot on [dev.groupme.com](https://dev.groupme.com/) 
- [install wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- rename `wrangler-example.toml` to `wrangler.toml`
- fill out values under the `[vars]` section
  - GROUP_ID - The ID of the group that the bot will be in
  - GROUPME_ACCESS_TOKEN - Your groupme api key from [dev.groupme.com](https://dev.groupme.com/)
  - BOT_USER_ID - The user id of the bot. You can get this if you make the bot post a message and get the `user_id` paramater
  - BOT_ID - The Bot ID found on [dev.groupme.com](https://dev.groupme.com/)
  - OPENAI_TOKEN - Your OpenAI API key 
- Run `wrangler publish`
- Add the URL displayed in the output as the bot's webhook url


## Issues

this code is awful so surely something will break. currently it doesn't handle code blocks well since openai is outputting some weird characters. will fix later.