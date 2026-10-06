---
tool: midjourney
name: Midjourney
checked: 2026-10-06
prompt_limit: null
image:
  models:
    - name: V8.2
      resolutions: [sd, hd]
      max_inputs: 4
      about: The default model; the Edit Model builds from up to 4 reference images
    - name: V8.1
      resolutions: [sd, hd]
      max_inputs: 4
      about: Same features as V8.2
    - name: V7
      about: "Older; has --q 1/2/4, Omni Reference (--oref) and the classic upscalers"
    - name: Niji 7
      about: Anime and illustration
video:
  modes:
    frames:
      roles: [start_frame, end_frame]
      needs: start_frame
      about: "Animate: image-to-video from a start frame, optionally with an end frame (--end); there is no text-to-video"
    extend:
      roles: [video]
      needs: video
      about: "Extend: adds 4 s to a clip, up to four times (21 s in all), with an automatic or a written motion prompt"
  models:
    - name: V1 Video
      modes: [frames, extend]
      durations: [5s]
      resolutions: [480p, 720p]
      max_inputs: 2
      about: 24 fps; no sound; the ratio follows the start frame
---

- Midjourney's settings are parameters at the end of the prompt text, and the human pastes the prompt as it is. Put them there: `--ar 16:9`, `--sd` or `--hd`, `--s 0–1000` (stylize, 100 by default), `--c 0–100` (chaos), `--raw` (less of the house look), `--no text, people` (the only negative prompt), `--sref <url>` or `--sref random` (style reference), `--seed`. The frontmatter mirrors them: `aspect_ratio` must match `--ar`, `resolution` must match `--sd`/`--hd`.
- Aspect ratio: any `W:H` in whole numbers (`139:100`, not `1.39:1`), up to 14:1, or 4:1 with `--hd`. There is no fixed list, so set it with `--ar`.
- Resolution: `sd` is 1024 px on the long side at 1:1 (16:9 gives 1456×816), `hd` is 2048 px (2912×1632) and costs more. Pan, Zoom Out and Vary Region bring an HD picture back to SD.
- Every prompt makes a grid of 4 pictures; the human picks from it. Draft Mode makes 24 small ones quickly.
- `--q` works on V7 only; multi-prompts with `::` and `--cref` do not work on V8; `--oref` is V7 only. On V8 use the Edit Model for a consistent character or product: up to 4 reference images, and edits by written instruction, inpainting and outpainting in the Editor. `--seed` on V8 gives nearly, not exactly, the same picture.
- Video: a clip is 5 s and silent. `--motion low` or `--motion high`; `--loop` makes the first and last frame meet; `--bs 1`, `2` or `4` is how many clips one run makes (the human's choice). HD (720p) video needs the Standard plan or above, in Fast mode.
- Midjourney has no public API; the human generates on midjourney.com.
