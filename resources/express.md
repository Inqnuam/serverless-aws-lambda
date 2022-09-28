`/src/routes/players.ts`

```js
import { Route } from "serverless-aws-lambda/route"; // important! note the /route
import { auth } from "../controllers/auth";
import { playersController } from "../controllers/playersController";

const route = new Route();

route.handle(auth, playersController);

route.use((error, req, res, next) => {
  console.log(error);
  res.status(500).send("Internal Server Error");
});

export default route;
```

route.handle is similar to Express [app.METHOD("/somePath, ...")](https://expressjs.com/en/4x/api.html#app), a function (async or not) which accepts 3 arguments. request, response and next.

Using this Express syntax requies esbuild `target` to be at least "ES2018" (NodeJS 11 i guess).  
By default is is set to "ES2018" 🙂.

More info about request, response, and next soon ...
