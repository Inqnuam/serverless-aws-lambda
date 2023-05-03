`serverless-aws-lambda` provied `Router` may be used to write a Lambda with ExpressJs compatible syntax, which supports ALB and API Gateway events (including multiValueQueryStringParameters and multiValueHeaders)

To get Type definitions please set `"moduleResolution": "NodeNext"` inside your `tsconfig.json`.

```js
// src/controllers/playersController.ts
import type { RouteController } from "serverless-aws-lambda/router";

export const playersController: RouteController = async (req, res, next) => {
  // dummy app logic
  const foundUser = await getUserById(req.query.id);

  res.json(foundUser);
};
```

```js
// src/routes/players.ts
import { Router } from "serverless-aws-lambda/router";
import { auth } from "../controllers/auth";
import { playersController } from "../controllers/playersController";

const route = Router();

route.use(auth, playersController);

route.use((error, req, res, next) => {
  console.log(error);
  res.status(500).send("Internal Server Error");
});

export default route;
```

`route.use` is similar to Express [app.use(...)](https://expressjs.com/en/4x/api.html#app), a function (async or not) which accepts 3-4 arguments. request, response and next.

```js
const route = Router();

route.use(auth);
route.use(playersController);
route.use((error, req, res, next) => {
  console.log(error);
  res.status(500).send("Internal Server Error");
});
```

or by chaning:

```js
const route = Router();

const errorHandler = (error, req, res, next) => {
  console.log(error);
  res.status(500).send("Internal Server Error");
};

route.use(auth).use(playersController).use(errorHandler);
```

or with multi argument:

```js
import { Router } from "serverless-aws-lambda/router";

const handler = Router();

const errorHandler = (error, req, res, next) => {
  console.log(error);
  res.status(500).send("Internal Server Error");
};

handler.use(auth, playersController, errorHandler);

export { handler };
```

### Request

| property | type      | doc                                                                                                                                                                                    | info                                                                                                                                                      |
| -------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| body     | any       | [doc](https://expressjs.com/en/4x/api.html#req.body)                                                                                                                                   | Request with json content-type are automatically parsed. Use body-parser middleware from `serverless-aws-lambda/body-parser` to parse Form Data and files |
| cookies  | key-value | [doc](https://expressjs.com/en/4x/api.html#req.cookies)                                                                                                                                | compatible with Express's cookie-parser                                                                                                                   |
| method   | string    | [doc](https://expressjs.com/en/4x/api.html#req.method)                                                                                                                                 |                                                                                                                                                           |
| params   | string[]  | As we don't handle custom routes we can't support named params, instead `params` will return an array of string containing `path` components separated by `/` (without `query` string) | Not compatible with Express                                                                                                                               |
| path     | string    | [doc](https://expressjs.com/en/4x/api.html#req.path)                                                                                                                                   |                                                                                                                                                           |
| protocol | string    | [doc](https://expressjs.com/en/4x/api.html#req.protocol)                                                                                                                               |                                                                                                                                                           |
| query    | key-value | [doc](https://expressjs.com/en/4x/api.html#req.query)                                                                                                                                  |                                                                                                                                                           |
| get      | function  | [doc](https://expressjs.com/en/4x/api.html#req.get)                                                                                                                                    |                                                                                                                                                           |

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

### Next

Similar to ExpressJs next function.

`next()` can take one argument.  
If an argument is provided Router triggers next middleware which has 4 arguments.  
This is usally used to handle errors (see examples above).  
Check Express documentation for more info.
