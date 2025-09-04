import { World } from "./game/World";
import { bindInput } from "./game/Input";
import { bindUI } from "./game/UI";
import type { Tool } from "./game/Types";

const app = document.getElementById("app")!;
const world = new World(app);

let tool: Tool = 'plant';
world.tool = tool;

function setTool(t: Tool) {
  tool = t;
  world.tool = t;
}

bindUI(setTool);

bindInput(world, world.grid, (t, x, y) => {
  const state = world.grid.tiles[y][x];
  if (t === 'plant') {
    world.plant(x, y, state); // World enforces distance + rules
  }
});

function loop() {
  world.tick(world.grid.tiles);
  requestAnimationFrame(loop);
}
loop();
