`/src/routes/players.ts`

```js
import { Router } from "serverless-aws-lambda/router"; // important! note the /router
import { auth } from "../controllers/auth";
import { playersController } from "../controllers/playersController";

const route = Router();

route.handle(auth, playersController);

route.use((error, req, res, next) => {
  console.log(error);
  res.status(500).send("Internal Server Error");
});

export default route;
```

route.handle is similar to Express [app.METHOD("/somePath, ...")](https://expressjs.com/en/4x/api.html#app), a function (async or not) which accepts 3 arguments. request, response and next.

More info about request, response, and next soon ...

### Request

| property | type      | doc                                                                                                                                                                                    | info                                                                                                                              |
| -------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| body     | any       | [doc](https://expressjs.com/en/4x/api.html#req.body)                                                                                                                                   | Request with json content-type are automatically parsed. Use body-parser middleware from the package to parse Form Data and files |
| cookies  | key-value | [doc](https://expressjs.com/en/4x/api.html#req.cookies)                                                                                                                                | compatible with Express's cookie-parser                                                                                           |
| method   | string    | [doc](https://expressjs.com/en/4x/api.html#req.method)                                                                                                                                 |                                                                                                                                   |
| params   | string[]  | As we don't handle custom routes we can't support named params, instead `params` will return an array of string containing `path` components separated by `/` (without `query` string) | Not compatible with Express                                                                                                       |
| path     | string    | [doc](https://expressjs.com/en/4x/api.html#req.path)                                                                                                                                   |                                                                                                                                   |
| protocol | string    | [doc](https://expressjs.com/en/4x/api.html#req.protocol)                                                                                                                               |                                                                                                                                   |
| query    | key-value | [doc](https://expressjs.com/en/4x/api.html#req.query)                                                                                                                                  |                                                                                                                                   |
| get      | function  | [doc](https://expressjs.com/en/4x/api.html#req.get)                                                                                                                                    |                                                                                                                                   |

++ includes also `event` raw object from AWS Lambda (except "`cookies`" which can be easly parsed with `cookie-parser` middleware)

### Response

| property    | type      | doc                                                                 | info                        |
| ----------- | --------- | ------------------------------------------------------------------- | --------------------------- |
| locals      | key-value | [doc](https://expressjs.com/en/4x/api.html#res.locals)              |                             |
| cookie      | function  | [doc](https://expressjs.com/en/4x/api.html#res.cookie)              |                             |
| clearCookie | function  | [doc](https://expressjs.com/en/4x/api.html#res.clearCookie)         |                             |
| end         | function  | Return anything from your lambda. All previous setters are ignored. | Not compatible with Express |
| get         | function  | [doc](https://expressjs.com/en/4x/api.html#res.get)                 |                             |
| json        | function  | [doc](https://expressjs.com/en/4x/api.html#res.json)                |                             |
| links       | function  | [doc](https://expressjs.com/en/4x/api.html#res.links)               |                             |
| location    | function  | [doc](https://expressjs.com/en/4x/api.html#res.location)            |                             |
| redirect    | function  | [doc](https://expressjs.com/en/4x/api.html#res.redirect)            |                             |
| send        | function  | [doc](https://expressjs.com/en/4x/api.html#res.send)                |                             |
| set         | function  | [doc](https://expressjs.com/en/4x/api.html#res.set)                 |                             |
| status      | function  | [doc](https://expressjs.com/en/4x/api.html#res.status)              |                             |
| type        | function  | [doc](https://expressjs.com/en/4x/api.html#res.type)                |                             |

++ includes also `context` object from AWS Lambda and the third AWS Lambda handler argument "`callback`"
