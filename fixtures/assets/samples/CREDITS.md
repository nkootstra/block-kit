# Sample images

Every image the fixtures, the docs, the landing page, the playground and the package's tests show
is one of these files, served from `https://cdn.block-kit.dev/samples/<file>`. They stand in for
the images Block Kit Builder's templates and Slack's docs use, which we can't redistribute.

- Photos come from [Unsplash](https://unsplash.com) under the
  [Unsplash License](https://unsplash.com/license), which allows copying, modifying and
  redistributing them, also commercially, without permission. Each is cropped and resized to the
  size of the image it replaces.
- Icons are drawn for this project (simple SVG shapes rendered to PNG) and are covered by the
  repository's [MIT licence](../../../LICENSE).

| File                           | Size        | Source                                                                                                                          | Author                                                                    | Replaces                                                        |
| ------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `beagle.e3711bc4.jpg`          | 1080 × 1080 | [Unsplash `dxi5bAG7az8`](https://unsplash.com/photos/dxi5bAG7az8), square crop                                                  | [Ciocan Ciprian](https://unsplash.com/@cipriann)                          | Block Kit Builder's `beagle.png`                                |
| `palm-tree.3fcaecef.jpg`       | 600 × 800   | [Unsplash `sK6vKcIOqsw`](https://unsplash.com/photos/sK6vKcIOqsw), 3:4 crop                                                     | [Igor Kyryliuk & Tetiana Kravchenko](https://unsplash.com/@igor_and_teti) | Block Kit Builder's `palmtree.png`                              |
| `plants.5b36fa8b.jpg`          | 1066 × 800  | [Unsplash `W-PtSipcxP4`](https://unsplash.com/photos/W-PtSipcxP4), 4:3 crop                                                     | [Anna Kharkivska](https://unsplash.com/@anna_kharkivska)                  | Block Kit Builder's `plants.png`                                |
| `portrait.ab6c68cb.jpg`        | 40 × 40     | [Unsplash `Abqrv8Qf7ic`](https://unsplash.com/photos/Abqrv8Qf7ic), head crop                                                    | [Lizgrin F](https://unsplash.com/@lizgrin)                                | Block Kit Builder's `profile_1.png`                             |
| `portrait-2.bbcd2277.jpg`      | 40 × 40     | [Unsplash `oOhTXx5mJqI`](https://unsplash.com/photos/oOhTXx5mJqI), head crop                                                    | [Rita Malçok](https://unsplash.com/@ritamalcok)                           | Block Kit Builder's `profile_2.png`                             |
| `cat.da842b96.jpg`             | 256 × 256   | [Unsplash `sIPOnRCG6ok`](https://unsplash.com/photos/sIPOnRCG6ok), square crop                                                  | [Enguerrand Photography](https://unsplash.com/@enguerrand)                | A cat avatar on `pbs.twimg.com`                                 |
| `tacos.271c2dbf.jpg`           | 640 × 434   | [Unsplash `_j4S4V2C8ew`](https://unsplash.com/photos/_j4S4V2C8ew), crop                                                         | [Frankie Lopez](https://unsplash.com/@frankielopez)                       | A taco photo on `assets3.thrillist.com`                         |
| `dinner-table.b8f41094.jpg`    | 1000 × 666  | [Unsplash `Gi0zkknkwpg`](https://unsplash.com/photos/Gi0zkknkwpg)                                                               | [Duong Thinh](https://unsplash.com/@duongtrungthinh)                      | A restaurant photo on `s3-media3.fl.yelpcdn.com`                |
| `kitten-tree.6f72129c.jpg`     | 1200 × 800  | [Unsplash `IWblYR8n9zw`](https://unsplash.com/photos/IWblYR8n9zw), 3:2 crop                                                     | [Koen Eijkelenboom](https://unsplash.com/@k03nntjeh)                      | Pexels photo 257532, a kitten in a tree (4800 × 3200, same 3:2) |
| `mountain-lake.d12ac6fc.jpg`   | 400 × 300   | [Unsplash `GA09PKfRIQY`](https://unsplash.com/photos/GA09PKfRIQY), 4:3 crop                                                     | [Adam Vradenburg](https://unsplash.com/@vradenburg)                       | `picsum.photos/400/300`, a random photo per request             |
| `kitten.4f40f3e3.jpg`          | 36 × 36     | [Unsplash `Qpjl_dXQrD8`](https://unsplash.com/photos/Qpjl_dXQrD8), head crop                                                    | [Koen Eijkelenboom](https://unsplash.com/@k03nntjeh)                      | `picsum.photos/36/36`, a random photo per request               |
| `video-thumbnail.d894bef5.jpg` | 480 × 360   | [Unsplash `2WY2ISXQFkM`](https://unsplash.com/photos/2WY2ISXQFkM), 16:9 crop letterboxed in black like a video host's thumbnail | [Carlos Gil](https://unsplash.com/@carlosgil83)                           | A YouTube thumbnail on `i.ytimg.com`                            |
| `laptop-icon.4575d6fc.png`     | 176 × 176   | Drawn for this project                                                                                                          | block-kit contributors                                                    | Block Kit Builder's `approvalsNewDevice.png`                    |
| `warning-icon.491cc33b.png`    | 40 × 40     | Drawn for this project                                                                                                          | block-kit contributors                                                    | Block Kit Builder's `notificationsWarningIcon.png`              |
| `play-icon.24cf386c.png`       | 48 × 48     | Drawn for this project: a neutral video provider icon                                                                           | block-kit contributors                                                    | Slack's YouTube unfurl icon on `a.slack-edge.com`               |
| `app-icon.81155d10.png`        | 36 × 36     | Drawn for this project                                                                                                          | block-kit contributors                                                    | Slack's default app icon on `a.slack-edge.com`                  |
| `bot-avatar.3d9f1d46.png`      | 40 × 40     | Drawn for this project: a neutral bot                                                                                           | block-kit contributors                                                    | Slack's bot avatar on `a.slack-edge.com`, in the people selects |

## Adding or replacing an image

1. Use a photo whose licence allows redistribution (Unsplash's does), or draw the image yourself.
   Match the size and aspect ratio of the image it stands in for, and keep the file small.
2. Name it `<name>.<first 8 hex digits of its SHA-256>.<ext>` (`shasum -a 256 <file>`) and commit
   it here with a row in the table above. A replacement gets a new name; never change a file
   under an existing name, since the CDN caches every sample for a year.
3. Upload it to the `block-kit-visual` R2 bucket under `samples/<file>` with its content type and
   `Cache-Control: public, max-age=31536000, immutable`, for example
   `wrangler r2 object put block-kit-visual/samples/<file> --file <file> --content-type image/jpeg --cache-control "public, max-age=31536000, immutable" --remote`.
   Upload it before anything requests its URL: Cloudflare caches a 404 for four hours, and only a
   purge of that URL clears it.
4. Check it: `curl -sI https://cdn.block-kit.dev/samples/<file>` answers `200` with the right
   `content-type`, and the downloaded bytes match the committed file.

`bun run references:check` fails when a fixture, a doc, the landing page, the playground or a
package test shows an image from any other host (placeholder hosts such as `example.com` aside),
or a sample that isn't committed here. The visual comparison, the renderer and the interaction
tests serve these files to the browser themselves (`tools/visual/src/samples.ts`), so they never
download them.
