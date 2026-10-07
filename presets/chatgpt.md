---
tool: chatgpt
name: ChatGPT Images
short: ChatGPT
checked: 2026-10-06
prompt_limit: null
image:
  aspect_ratios: ["1:1", "3:2", "2:3", "16:9", "9:16", "4:3", "3:4", "3:1", "1:3"]
  models:
    - name: Images 2.5
      max_inputs: 16
      about: On every plan; 1024×1024 unless a ratio is set; strong on text in images and on precise edits
---

- Any ratio between 1:3 and 3:1 works: the human picks it in the chooser or you write it in the prompt. The list above is the common ones.
- Resolution is not chosen in ChatGPT (it is below the API's 3840 px), so leave `resolution` out.
- One prompt can make up to 8 consistent pictures; how many is the human's choice.
- Edits: attach the picture to change as a `reference` and say what to change. The human can mark the exact part of the picture to change, draw a sketch as a reference, or use a template; a change request from them may describe that.
- Two tiers in the chat: Instant, and Thinking, which reasons and can search the web before drawing.
- ChatGPT makes no video: OpenAI closed Sora on 26 April 2026. Ask for video in another tool.
