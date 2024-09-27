# Tutorial: Top-Down Shooter

In this tutorial, we'll walk through building an eagle eye perspective top-down shooter game, utilizing the Hathora `BuildKit` client and server libraries to enable multiplayer capabilities.

This tutorial is written to be as user-friendly as possible; if you're a seasoned developer you may find yourself skipping sections, and that's completely okay! This is intended as a quick-start reference to using the Hathora `BuildKit` tools, so approach the article in any way you see fit.

## Repo

This game's source code can be found [here](https://github.com/hathora/topdown-shooter). The repo's README file contains instructions for running the game on your local machine, and there is a deployed version of the game which you can try [here](https://hathora-topdown-shooter.surge.sh/).

By the end of this tutorial, the game will look like this:

![A screenshot of the completed top-down shooter game in action.](https://user-images.githubusercontent.com/5400947/192792673-3c6c5496-3c52-4d0d-87d6-b04f5ef59ea9.png)

## Project structure and common files

To bootstrap our base project's structure, we'll be be leveraging a tool called [create-hathora-buildkit](https://www.npmjs.com/package/create-hathora-buildkit). To run this tool, navigate to the folder where you keep your various projects in your CLI and run the following command:

```bash
npm init hathora-buildkit
```

This will prompt you for a valid project name, and automatically generate a basic project structure and install dependencies.

After that completes, `cd` into your fresh project and create a new folder for common files via:

```bash
cd topdown-shooter # replace "topdown-shooter" with your project's name
mkdir common
```

Next, let's create a few files. Go ahead and add the following files, with their cooresponding source code:

### `common/map.ts`

```ts
export const MAP_BOUNDARIES = {
  top: -400,
  left: -450,
  bottom: 1450,
  right: 550,
};

export const MAP_WIDTH = MAP_BOUNDARIES.right - MAP_BOUNDARIES.left;
export const MAP_HEIGHT = MAP_BOUNDARIES.bottom - MAP_BOUNDARIES.top;

// Wall tile is 52x52
export const MAP = [
  // Top base
  {
    x: -156,
    y: -156,
    width: 52,
    height: 312,
  },
  {
    x: -156,
    y: -156,
    width: 468,
    height: 52,
  },
  {
    x: 260,
    y: -156,
    width: 52,
    height: 312,
  },

  // Blockades
  {
    x: -104,
    y: 780,
    width: 104,
    height: 52,
  },
  {
    x: 104,
    y: 624,
    width: 104,
    height: 52,
  },
  {
    x: -104,
    y: 468,
    width: 104,
    height: 52,
  },
  {
    x: 104,
    y: 312,
    width: 104,
    height: 52,
  },

  // Bottom base
  {
    x: -156,
    y: 936,
    width: 52,
    height: 312,
  },
  {
    x: -156,
    y: 1196,
    width: 468,
    height: 52,
  },
  {
    x: 260,
    y: 936,
    width: 52,
    height: 312,
  },
];
```

This file contains information about the rectangle structures of our map. Feel free to play around with the values in here to customize your map!

### `common/messages.ts`

```ts
import { Direction, GameState } from "./types";

export enum ClientMessageType {
  SetDirection,
  SetAngle,
  Shoot,
}

export enum ServerMessageType {
  StateUpdate,
}

export type ClientMessage = SetDirectionMessage | SetAngleMessage | ShootMessage;

export type SetDirectionMessage = {
  type: ClientMessageType.SetDirection;
  direction: Direction;
};

export type SetAngleMessage = {
  type: ClientMessageType.SetAngle;
  angle: number;
};

export type ShootMessage = {
  type: ClientMessageType.Shoot;
};

export type ServerMessage = StateUpdateMessage;

export type StateUpdateMessage = {
  type: ServerMessageType.StateUpdate;
  state: GameState;
  ts: number;
};
```

This file exports an enum and several message types for that will be used on both our client and server applications. These types are used to represent the message packets being passed back and forth between the client and server.

### `common/types.ts`

```ts
export enum Direction {
  None,
  Up,
  Down,
  Left,
  Right,
}

export type Position = {
  x: number;
  y: number;
};

export type Player = {
  id: string;
  position: Position;
  aimAngle: number;
};

export type Bullet = {
  id: number;
  position: Position;
};

export type GameState = {
  players: Player[];
  bullets: Bullet[];
};
```

This file contains another enum and several additional types that will again be shared between both server and client which represent game state information.

## Server setup

Next let's get started with setting up our game's server.

From within the root of your project's folder, run the following to add the single additional server dependency we'll be leveraging for this game ([detect-collisions](https://www.npmjs.com/package/detect-collisions)):

```bash
cd server
npm install detect-collisions
```

Because we're using TypeScript for our project, we'll also want to specify a `tsconfig.json` file in our `server` folder to configure the language appropriately for our project:

```json
{
  "compilerOptions": {
    "esModuleInterop": true,
    "module": "esnext",
    "strict": true,
    "target": "esnext",
    "moduleResolution": "node",
    "isolatedModules": true
  }
}
```

Now with that out of the way, let's begin writing some code!

## Server code

The main file that contains our server code is called `server.ts`, in the `server` folder.

### Imports and constant configuration

Let's dive in and create the file in our IDE, then enter the following imports and constant value config (replacing the boilerplate code that was in `server.ts` previously):

```ts
import { register, Store, UserId, RoomId } from "@hathora/server-sdk";
import dotenv from "dotenv";
import { Box, Body, System } from "detect-collisions";
import { Direction, GameState } from "../common/types";
import { ClientMessage, ClientMessageType, ServerMessage, ServerMessageType } from "../common/messages";
import { MAP, MAP_BOUNDARIES, MAP_HEIGHT, MAP_WIDTH } from "../common/map";

// The millisecond tick rate
const TICK_INTERVAL_MS = 50;

// Player configuration
const PLAYER_RADIUS = 20; // The player's circular radius, used for collision detection
const PLAYER_SPEED = 200; // The player's movement speed

// Bullet configuration
const BULLET_RADIUS = 9; // The bullet's circular radius, used for collision detection
const BULLET_SPEED = 800; // The bullet's movement speed when shot

// An x, y vector representing the spawn location of the player on the map
const SPAWN_POSITION = {
  x: 100,
  y: 150,
};

// The width of the map boundary rectangles
const BOUNDARY_WIDTH = 50;

// An enum which represents the type of body for a given object
enum BodyType {
  Player,
  Bullet,
  Wall,
}

// A type to represent a physics body with a type (uses BodyType above)
type PhysicsBody = Body & { oType: BodyType };

// A type which defines the properties of a player used internally on the server (not sent to client)
type InternalPlayer = {
  id: UserId;
  body: PhysicsBody;
  direction: Direction;
  angle: number;
};

// A type which defines the properties of a bullet used internally on the server (not sent to client)
type InternalBullet = {
  id: number;
  body: PhysicsBody;
  angle: number;
};

// A type which represents the internal state of the server, containing:
//   - physics: our "physics" engine (detect-collisions library)
//   - players: an array containing all connected players to a room
//   - bullets: an array containing all bullets currently in the air for a given room
type InternalState = {
  physics: System;
  players: InternalPlayer[];
  bullets: InternalBullet[];
};

// A map which the server uses to contain all room's InternalState instances
const rooms: Map<RoomId, InternalState> = new Map();
```

The constants at the top (`CAPITAL_CASE` variables under the `import` statements) represent various configurable options in our game, such as the size of our character, or the speed of our bullets. Feel free to mess around with these options after we've added some more code and analyze the results, this can be a good place to begin tailoring the code in this example to fit your own game.

### The server store

Next, we will add what is known as our `store` object. This object is responsible for our game server's core logic. The only thing that isn't handled inside our store object is the game's update loop (we'll examine this shortly).

```ts
// ...
// A map which the server uses to contain all room's InternalState instances
const rooms: Map<RoomId, InternalState> = new Map();

// Create an object to represent our Store
const store: Store = {
  // newState is called when a user requests a new room, this is a good place to handle any world initialization
  newState(roomId: bigint, userId: string): void {
    const physics = new System();

    // Create map box bodies
    MAP.forEach(({ x, y, width, height }) => {
      physics.insert(wallBody(x, y, width, height));
    });

    // Create map boundary boxes
    const { top, left, bottom, right } = MAP_BOUNDARIES;

    physics.insert(wallBody(left, top - BOUNDARY_WIDTH, MAP_WIDTH, BOUNDARY_WIDTH)); // top
    physics.insert(wallBody(left - BOUNDARY_WIDTH, top, BOUNDARY_WIDTH, MAP_HEIGHT)); // left
    physics.insert(wallBody(left, bottom, MAP_WIDTH, BOUNDARY_WIDTH)); // bottom
    physics.insert(wallBody(right, top, BOUNDARY_WIDTH, MAP_HEIGHT)); // right

    // Finally, associate our roomId to our game state
    rooms.set(roomId, {
      physics,
      players: [],
      bullets: [],
    });
  },

  // subscribeUser is called when a new user enters a room, it's an ideal place to do any player-specific initialization steps
  subscribeUser(roomId: bigint, userId: string): void {
    // Make sure the room exists
    if (!rooms.has(roomId)) {
      return;
    }
    const game = rooms.get(roomId)!;

    // Make sure the player hasn't already spawned
    if (!game.players.some((player) => player.id === userId)) {
      // Then create a physics body for the player
      const body = game.physics.createCircle(SPAWN_POSITION, PLAYER_RADIUS);
      game.players.push({
        id: userId,
        body: Object.assign(body, { oType: BodyType.Player }),
        direction: Direction.None,
        angle: 0,
      });
    }
  },

  // unsubscribeUser is called when a user disconnects from a room, and is the place where you'd want to do any player-cleanup
  unsubscribeUser(roomId: bigint, userId: string): void {
    // Make sure the room exists
    if (!rooms.has(roomId)) {
      return;
    }

    // Remove the player from the room's state
    const game = rooms.get(roomId)!;
    const idx = game.players.findIndex((player) => player.id === userId);
    if (idx >= 0) {
      game.players.splice(idx, 1);
    }
  },

  // onMessage is an integral part of your game's server. It is responsible for reading messages sent from the clients and handling them accordingly, this is where your game's event-based logic should live
  onMessage(roomId: bigint, userId: string, data: ArrayBufferView): void {
    if (!rooms.has(roomId)) {
      return;
    }

    // Get the player, or return out of the function if they don't exist
    const game = rooms.get(roomId)!;
    const player = game.players.find((player) => player.id === userId);
    if (player === undefined) {
      return;
    }

    // Parse out the data string being sent from the client
    const dataStr = Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
    const message: ClientMessage = JSON.parse(dataStr);

    // Handle the various message types, specific to this game
    if (message.type === ClientMessageType.SetDirection) {
      player.direction = message.direction;
    } else if (message.type === ClientMessageType.SetAngle) {
      player.angle = message.angle;
    } else if (message.type === ClientMessageType.Shoot) {
      const body = game.physics.createCircle({ x: player.body.x, y: player.body.y }, BULLET_RADIUS);
      game.bullets.push({
        id: Math.floor(Math.random() * 1e6),
        body: Object.assign(body, { oType: BodyType.Bullet }),
        angle: player.angle,
      });
    }
  },
};
```

Have a look over the comments in the code above to get a better sense of how each function in the store works. At a high level: `newState` initializes rooms, `subscribeUser` is called when a user joins a game room, `unsubscribeUser` is called when a user leaves a room, and `onMessage` handles incoming messages from game clients and manipulates the given room's state accordingly.

### Connecting to the coordinator, the update loop, and syncing state with clients

The final chunk of code in our server does a few things. Namingly, it connects our server to the Hathora coordinator (which handles load balancing, authentication, and a lot more) and passes it our game's store. It then starts an interval running at our predefined `TICK_INTERVAL_MS` rate which runs the game's `tick` function (defined next) for each active room on our server, and broacasts the state updates to each client connected to each room. After that, we have our game's `tick` function, which is where the frame-by-frame logic of your game lives. And finally, the `broadcastStateUpdate` function handles delivery of state updates to each connected client of a given `roomId`.

```ts
      // ...
      game.bullets.push({
        id: Math.floor(Math.random() * 1e6),
        body: Object.assign(body, { oType: BodyType.Bullet }),
        angle: player.angle,
      });
    }
  },
};

// Load our environment variables into process.env
dotenv.config({ path: "../.env" });
if (process.env.APP_SECRET === undefined) {
  throw new Error("APP_SECRET not set");
}

// Connect to the Hathora coordinator
const coordinator = await register({
  coordinatorHost: process.env.COORDINATOR_HOST,
  appSecret: process.env.APP_SECRET,
  authInfo: { anonymous: { separator: "-" } },
  store,
});

const { host, appId, storeId } = coordinator;
console.log(`Connected to coordinator at ${host} with appId ${appId} and storeId ${storeId}`);

// Start the game's update loop
setInterval(() => {
  rooms.forEach((game, roomId) => {
    // Tick each room's game
    tick(game, TICK_INTERVAL_MS / 1000);

    // Send the state updates to each client connected to that room
    broadcastStateUpdate(roomId);
  });
}, TICK_INTERVAL_MS);

// The frame-by-frame logic of your game should live in it's server's tick function. This is often a place to check for collisions, compute score, and so forth
function tick(game: InternalState, deltaMs: number) {
  // Move each player with a direction set
  game.players.forEach((player) => {
    if (player.direction === Direction.Up) {
      player.body.y -= PLAYER_SPEED * deltaMs;
    } else if (player.direction === Direction.Down) {
      player.body.y += PLAYER_SPEED * deltaMs;
    } else if (player.direction === Direction.Left) {
      player.body.x -= PLAYER_SPEED * deltaMs;
    } else if (player.direction === Direction.Right) {
      player.body.x += PLAYER_SPEED * deltaMs;
    }
  });

  // Move all active bullets along a path based on their radian angle
  game.bullets.forEach((bullet) => {
    bullet.body.x += Math.cos(bullet.angle) * BULLET_SPEED * deltaMs;
    bullet.body.y += Math.sin(bullet.angle) * BULLET_SPEED * deltaMs;
  });

  // Handle collision detections between the various types of PhysicsBody's
  game.physics.checkAll(({ a, b, overlapV }: { a: PhysicsBody; b: PhysicsBody; overlapV: SAT.Vector }) => {
    if (a.oType === BodyType.Player && b.oType === BodyType.Wall) {
      a.x -= overlapV.x;
      a.y -= overlapV.y;
    } else if (a.oType === BodyType.Player && b.oType === BodyType.Player) {
      b.x += overlapV.x;
      b.y += overlapV.y;
    } else if (a.oType === BodyType.Bullet && b.oType === BodyType.Wall) {
      game.physics.remove(a);
      const bulletIdx = game.bullets.findIndex((bullet) => bullet.body === a);
      if (bulletIdx >= 0) {
        game.bullets.splice(bulletIdx, 1);
      }
    } else if (a.oType === BodyType.Bullet && b.oType === BodyType.Player) {
      game.physics.remove(a);
      const bulletIdx = game.bullets.findIndex((bullet) => bullet.body === a);
      if (bulletIdx >= 0) {
        game.bullets.splice(bulletIdx, 1);
      }
      game.physics.remove(b);
      const playerIdx = game.players.findIndex((player) => player.body === b);
      if (playerIdx >= 0) {
        game.players.splice(playerIdx, 1);
      }
    }
  });
}

function broadcastStateUpdate(roomId: RoomId) {
  const game = rooms.get(roomId)!;
  const subscribers = coordinator.getSubscribers(roomId);
  const now = Date.now();
  // Map properties in the game's state which the clients need to know about to render the game
  const state: GameState = {
    players: game.players.map((player) => ({
      id: player.id,
      position: { x: player.body.x, y: player.body.y },
      aimAngle: player.angle,
    })),
    bullets: game.bullets.map((bullet) => ({
      id: bullet.id,
      position: { x: bullet.body.x, y: bullet.body.y },
    })),
  };

  // Send the state update to each connected client
  subscribers.forEach((userId) => {
    const msg: ServerMessage = {
      type: ServerMessageType.StateUpdate,
      state,
      ts: now,
    };
    coordinator.sendMessage(roomId, userId, Buffer.from(JSON.stringify(msg), "utf8"));
  });
}

function wallBody(x: number, y: number, width: number, height: number): PhysicsBody {
  return Object.assign(new Box({ x, y }, width, height, { isStatic: true }), {
    oType: BodyType.Wall,
  });
}
```

After putting all of the above pieces together, you will have an operational game server. Congrats! In the next section we will examine the initial setup of the Phaser 3 game client, followed by the code for this particular game.

## Client setup

Now we're going to look at setting up the `client` folder, such that it's able to serve your game client to the browser and eventually connect to your server!

For our topdown shooter project, we'll need to once again install some additional dependencies. For the client, these are: [hash.js](https://www.npmjs.com/package/hash.js/v/1.0.1), [interpolation-buffer](https://www.npmjs.com/package/interpolation-buffer), and [phaser](https://www.npmjs.com/package/phaser).

Assuming you're still in the `server` folder, run the following to achieve this:

```bash
cd ../client
npm install hash.js interpolation-buffer phaser
```

After those install, edit the `index.html` file such that it looks as follows:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Topdown Shooter</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

This is a simple HTML file, however you'll notice it's referencing a file we haven't looked at yet: `src/main.ts`.

Back in our code editor, let's remove everything that was in `src/main.ts`, and for now, simply write a `console.log` statement inside it. Like this:

```ts
import "console";

console.log("Client is running!");
```

Next, return to the root of your project and run the following, then open `http://localhost:5173` in your browser:

```bash
cd ..
npm run client
```

The styling on the boilerplate page will be broken, however if everything is hooked up properly, you should see the following message in the JavaScript console:

![A screenshot showing the JS console after configuration](https://user-images.githubusercontent.com/7004280/213260347-5446279a-57e5-4604-a368-d3401ebab22e.png)

From here, we will go through the clientside game code, which is responsible for rendering the game's visuals and sending player input to the server.

## Client code

### Static Assets

The first thing we're going to tackle, ironically, is not code.

First, create a folder inside of `client/src` called: `assets`.

```bash
cd client/src
mkdir assets
```

Next, navigate to each of the following links and download each image into your assets folder (thanks [Kenney](https://kenney.nl/assets/topdown-shooter)!):

- [bullet.png](https://github.com/hathora/topdown-shooter/blob/develop/client/src/assets/bullet.png)
- [grass.png](https://github.com/hathora/topdown-shooter/blob/develop/client/src/assets/grass.png)
- [player.png](https://github.com/hathora/topdown-shooter/blob/develop/client/src/assets/player.png)
- [wall.png](https://github.com/hathora/topdown-shooter/blob/develop/client/src/assets/wall.png)

With that done, we can get our hands dirty with the first piece of client code.

### Connection helper

The first file we'll examine is a connection helper, as it contains a class used by the logical first step of our client code (the `BootScene` class). We need to create this file in the root of our `client` folder and name it `connection.ts`.

Below is the code for this file:

```ts
import { HathoraClient } from "@hathora/client-sdk";
import { HathoraTransport, TransportType } from "@hathora/client-sdk/lib/transport";

import { ClientMessage, ServerMessage } from "../../common/messages";

export type UpdateListener = (update: ServerMessage) => void;

// A class representing a connection to our server room
export class RoomConnection {
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();
  private connection: HathoraTransport | undefined;
  private listeners: UpdateListener[] = [];

  public constructor(private client: HathoraClient, public token: string, public roomId: string) {}

  public async connect() {
    this.connection = await this.client.connect(
      this.token,
      this.roomId,
      (msg) => this.handleMessage(msg),
      (err) => this.handleClose(err),
      TransportType.WebSocket
    );
  }

  public addListener(listener: UpdateListener) {
    this.listeners.push(listener);
  }

  public sendMessage(msg: ClientMessage) {
    this.connection?.write(this.encoder.encode(JSON.stringify(msg)));
  }

  public disconnect() {
    this.connection?.disconnect();
    this.listeners = [];
  }

  private handleMessage(data: ArrayBuffer) {
    const msg: ServerMessage = JSON.parse(this.decoder.decode(data));
    this.listeners.forEach((listener) => listener(msg));
  }

  private handleClose(err: { code: number; reason: string }) {
    console.error("close", err);
  }
}
```

This class is used to facilitate our connection with the Hathora server we made previously. It contains helper functions to instantiate and utilize this connection, which we will use in the next section.

### BootScene

The boot scene is the step in our front-end game logic which is responsible for preloading assets, and initalization. For this step and the next, we'll need a new folder.

```bash
cd src
mkdir scenes
```

Within the scenes folder, create a new TypeScript file and name it `BootScene.ts`. First, we import everything we need to construct this scene, and set a new instance of the `HathoraClient` class to a variable.

```ts
import { Scene } from "phaser";
import { HathoraClient } from "@hathora/client-sdk";
import { RoomConnection } from "../connection";

// Instantiate an object which represents our client
const client = new HathoraClient(process.env.APP_ID as string, process.env.COORDINATOR_HOST);
```

After that, we define our `BootScene` class, extending from Phaser's `Scene` class and override the `preload` and `create` methods. In `preload` we load our image assets which you downloaded earlier. In `create` we create a new connection to a room on our Hathora server, and and start the game scene, passing the connection and token.

```ts
// Here we extend from Phaser's Scene class to create a game scene compatible with Phaser
export class BootScene extends Scene {
  constructor() {
    // This string is used to identify this scene when it's running
    super("scene-boot");
  }

  // Called immediately after the constructor, this function is used to preload assets
  preload() {
    // Load our assets from before
    this.load.image("player", "player.png");
    this.load.image("bullet", "bullet.png");
    this.load.image("wall", "wall.png");
    this.load.image("grass", "grass.png");
  }

  // Called before the update loop begins, create is used to intialize what the scene needs
  create() {
    // Make a call to our getToken function, defined below
    getToken().then(async (token) => {
      // Once we have a token, we can get our roomId
      const roomId = await getRoomId(token);
      // With a roomId, we can establish a connection to the room on server
      const connection = new RoomConnection(client, token, roomId);
      await connection.connect();

      // After we have a connection and token, start the game scene, passing in both
      this.scene.start("scene-game", { connection, token });
    });
  }
}
```

The first function, `getToken` is used to get the token either from an existing session via `sessionStorage`, or create a new one using the `client` object we defined at the top. `getRoomId` either grabs the roomId from the URL or creates a new room.

```ts
      // ...
      // After we have a connection and token, start the game scene, passing in both
      this.scene.start("scene-game", { connection, token });
    });
  }
}

// The getToken function first checks sessionStorage to see if there is an existing token, and if there is returns it. If not, it logs the user into a new session and updates the sessionStorage key.
async function getToken(): Promise<string> {
  const maybeToken = sessionStorage.getItem("topdown-shooter-token");
  if (maybeToken !== null) {
    return maybeToken;
  }
  const token = await client.loginAnonymous();
  sessionStorage.setItem("topdown-shooter-token", token);
  return token;
}

// getRoomId will first check if the location's pathname contains the roomId, and will return it if it does, otherwise it will request one from the HathoraClient instance we defined earlier.
async function getRoomId(token: string): Promise<string> {
  if (location.pathname.length > 1) {
    return location.pathname.split("/").pop()!;
  } else {
    const roomId = await client.create(token, new Uint8Array());
    history.pushState({}, "", `/${roomId}`);
    return roomId;
  }
}
```

Now we've completed writing our `BootScene.ts` implementation, and will proceed to the `GameScene.ts` file.

### GameScene

```ts
import Phaser, { Math as pMath, Scene } from "phaser";
import { ClientMessageType } from "../../../common/messages";
import { Bullet, Direction, GameState, Player } from "../../../common/types";
import { InterpolationBuffer } from "interpolation-buffer";
import { RoomConnection } from "../connection";
import { MAP, MAP_BOUNDARIES, MAP_HEIGHT, MAP_WIDTH } from "../../../common/map";
import { HathoraClient } from "@hathora/client-sdk";

export class GameScene extends Scene {
  // A variable to represent our RoomConnection instance
  private connection!: RoomConnection;

  // The buffer which holds state snapshots
  private stateBuffer: InterpolationBuffer<GameState> | undefined;
  // A map of player sprites currently connected
  private players: Map<string, Phaser.GameObjects.Sprite> = new Map();
  // A map of bullet sprites currently in-air
  private bullets: Map<number, Phaser.GameObjects.Sprite> = new Map();
  // The Hathora user for the current client's connected player
  private currentUserID: string | undefined;
  // The current client's connected player's sprite object
  private playerSprite: Phaser.GameObjects.Sprite | undefined;
  // The previous tick's aim radians (used to check if aim has changed, before sending an update)
  private prevAimRad: number = 0;

  constructor() {
    super("scene-game");
  }

  init({ connection, token }: { connection: RoomConnection; token: string }) {
    // Receive connection and user data from BootScene
    this.connection = connection;

    const currentUser = HathoraClient.getUserFromToken(token);
    this.currentUserID = currentUser.id;
  }

  create() {
    this.connection.addListener(({ state, ts }) => {
      // Start enqueuing state updates
      if (this.stateBuffer === undefined) {
        this.stateBuffer = new InterpolationBuffer(state, 50, lerp);
      } else {
        this.stateBuffer.enqueue(state, [], ts);
      }
    });

    // Handle keyboard input
    const keys = this.input.keyboard.addKeys("W,S,A,D") as {
      W: Phaser.Input.Keyboard.Key;
      S: Phaser.Input.Keyboard.Key;
      A: Phaser.Input.Keyboard.Key;
      D: Phaser.Input.Keyboard.Key;
    };
    let prevDirection = Direction.None;

    const handleKeyEvt = () => {
      let direction: Direction;
      if (keys.W.isDown) {
        direction = Direction.Up;
      } else if (keys.S.isDown) {
        direction = Direction.Down;
      } else if (keys.D.isDown) {
        direction = Direction.Right;
      } else if (keys.A.isDown) {
        direction = Direction.Left;
      } else {
        direction = Direction.None;
      }

      if (prevDirection !== direction) {
        // If connection is open and direction has changed, send updated direction
        prevDirection = direction;
        this.connection.sendMessage({ type: ClientMessageType.SetDirection, direction });
      }
    };

    this.input.keyboard.on("keydown", handleKeyEvt);
    this.input.keyboard.on("keyup", handleKeyEvt);

    // Handle mouse-click input
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => {
      // If the connection is open, send through click events
      this.connection.sendMessage({ type: ClientMessageType.Shoot });
    });

    // Render grass
    this.add.tileSprite(MAP_BOUNDARIES.left, MAP_BOUNDARIES.top, MAP_WIDTH, MAP_HEIGHT, "grass").setOrigin(0, 0);

    // Render map objects
    MAP.forEach(({ x, y, width, height }) => {
      this.add.tileSprite(x, y, width, height, "wall").setOrigin(0, 0);
    });

    // Set the main camera's background colour and bounding box
    this.cameras.main.setBounds(MAP_BOUNDARIES.left, MAP_BOUNDARIES.top, MAP_WIDTH, MAP_HEIGHT);
  }

  update() {
    // If the stateBuffer hasn't been defined, skip this update tick
    if (this.stateBuffer === undefined) {
      return;
    }

    // Get the mousePointer and current interpolated state from the buffer
    const { mousePointer } = this.input;
    const { state } = this.stateBuffer.getInterpolatedState(Date.now());

    // Synchronize the players in our game's state with sprites to represent them graphically
    this.syncSprites(
      this.players,
      new Map(
        state.players.map((player) => [
          player.id,
          new Phaser.GameObjects.Sprite(this, player.position.x, player.position.y, "player").setRotation(
            player.aimAngle
          ),
        ])
      )
    );

    // Do the same with bullets
    this.syncSprites(
      this.bullets,
      new Map(
        state.bullets.map((bullet) => [
          bullet.id,
          new Phaser.GameObjects.Sprite(this, bullet.position.x, bullet.position.y, "bullet"),
        ])
      )
    );

    // If this.playerSprite has been defined (a ref to our own sprite), send our mouse position to the server
    if (this.playerSprite) {
      this.sendMousePosition(mousePointer, this.playerSprite);
    }
  }

  private sendMousePosition(mousePointer: Phaser.Input.Pointer, playerSprite: Phaser.GameObjects.Sprite) {
    // Extract the mouse's coordinates, player's coordinates, and zoom + worldView properties of scene's the main camera
    const { x: mouseX, y: mouseY } = mousePointer;
    const { x: playerX, y: playerY } = playerSprite;
    const { zoom, worldView } = this.cameras.main;

    // Establish the angle between the player's camera-relative position and the mouse
    const relX = (playerX - worldView.x) * zoom;
    const relY = (playerY - worldView.y) * zoom;
    const aimRad = pMath.Angle.Between(relX + zoom, relY + zoom, mouseX, mouseY);
    const aimMoved = this.prevAimRad !== aimRad;

    // Only if the aim has updated, send the update
    if (aimMoved) {
      this.connection.sendMessage({ type: ClientMessageType.SetAngle, angle: aimRad });
    }

    this.prevAimRad = aimRad;
  }

  private syncSprites<T>(oldSprites: Map<T, Phaser.GameObjects.Sprite>, newSprites: Map<T, Phaser.GameObjects.Sprite>) {
    newSprites.forEach((sprite, id) => {
      if (oldSprites.has(id)) {
        const oldSprite = oldSprites.get(id)!;
        oldSprite.x = sprite.x;
        oldSprite.y = sprite.y;
        oldSprite.rotation = sprite.rotation;
      } else {
        this.add.existing(sprite);
        oldSprites.set(id, sprite);

        // Follow this client's player-controlled sprite
        if (this.currentUserID && id === this.currentUserID) {
          this.cameras.main.startFollow(sprite);
          this.playerSprite = sprite;
        }
      }
    });
    oldSprites.forEach((sprite, id) => {
      if (!newSprites.has(id)) {
        sprite.destroy();
        oldSprites.delete(id);
      }
    });
  }
}
```

For this example, I'm also going to provide the entire class then breakdown it's flow.In this scene's case, the `init` function runs immediately after the constructor, assigning the parameters our scene was started with previously (`connection`, and `token`). After that our `create` function creates a state update listener and pipes the state into the interpolation buffer, to perform linear interpolation.

Linear interpolation is a method of slightly delaying state updates in exchange for smoothing the transitions between them.

After that, we create a helper variable containing references to the WSAD keys which we will use to control our character. We then use this key reference in defining our keyboard event handler. It listens for key presses and will send the player's direction of travel to the server if it should change.

With that out of the way, we move on to rendering the environment for our game's map. This is accomplished by first stretching a tile sprite over the entire width and height of the map. Then we render each rectangle in our map, also using a stretched tile sprite.

Lastly, in our `create` method, we specify the bounding box for our camera which we get from our map properties.

The last function is `update`, which is called repeatedly at our game's framerate. This function first checks if there is a defined state buffer, and if there isn't, it will return to short circuit the method and prevent anything else from being run.

We then sync the interpolated game state with Phaser sprites to represent them on screen. We do this with both the player sprites, and the bullets.

Finally we check if the current client's player sprite has been defined, and if it has, we send through our player's rotational input to the server.

That about wraps up the core Phaser functions in the `GameScene`. The last thing to do for this file is to add our lerping functions (linear interpolation) which are utilized by the state buffer.

These methods look like this, and go at the bottom of the file, beneath the class:

```ts
function lerp(from: GameState, to: GameState, pctElapsed: number): GameState {
  return {
    players: to.players.map((toPlayer) => {
      const fromPlayer = from.players.find((p) => p.id === toPlayer.id);
      return fromPlayer !== undefined ? lerpPlayer(fromPlayer, toPlayer, pctElapsed) : toPlayer;
    }),
    bullets: to.bullets.map((toBullet) => {
      const fromBullet = from.bullets.find((p) => p.id === toBullet.id);
      return fromBullet !== undefined ? lerpBullet(fromBullet, toBullet, pctElapsed) : toBullet;
    }),
  };
}

function lerpPlayer(from: Player, to: Player, pctElapsed: number): Player {
  return {
    id: to.id,
    position: {
      x: from.position.x + (to.position.x - from.position.x) * pctElapsed,
      y: from.position.y + (to.position.y - from.position.y) * pctElapsed,
    },
    aimAngle: to.aimAngle,
  };
}

function lerpBullet(from: Bullet, to: Bullet, pctElapsed: number): Bullet {
  return {
    id: to.id,
    position: {
      x: from.position.x + (to.position.x - from.position.x) * pctElapsed,
      y: from.position.y + (to.position.y - from.position.y) * pctElapsed,
    },
  };
}
```

And that does it, with our game scene out of the way, the last step is to implement our entry point file (`main.ts`). This is by far the easiest thing we've done yet, so hang in there, we're almost done!

### main.ts

Previously in `main.ts`, I asked you to test your implementation by adding a console log and an import statement. You should now remove these and replace it with the following:

```ts
import { Game, AUTO } from "phaser";

// Scenes
import { GameScene } from "./scenes/GameScene";
import { BootScene } from "./scenes/BootScene";

new Game({
  type: AUTO,
  width: 800,
  height: 600,
  scene: [BootScene, GameScene],
  parent: "root",
});
```

`main.ts` is the entrypoint for our client, meaning it will be run first and should be used to kick the whole thing off. We do this by importing our scenes, and passing them to a newly created `Phaser.Game` object (note we don't need to assign this to anything).

With this done, you're now ready to run the project.

Navigate back to your project's root folder within your CLI, and open a duplicate CLI tab or window in the same folder.

In the first, run:

```bash
npm run server
```

This will start up our game's server locally.

In the second CLI tab/window, run:

```bash
npm run client
```

This will boot our game's client locally.

If there's no errors to debug, you can now open `https://localhost:5173` in your browser, start a game, and try it out!

If you want to test it with two browsers, make sure they have the same pathname in their URL. You can achieve this by opening one browser tab, copying the full URL, then opening a second tab and pasting the URL into the navigation bar. Doing this will enable you to test the multiplayer capabilites of what you've created!

**Congratulations, and enjoy using Hathora!** 😇
