const mineflayer = require("mineflayer");
const config = require("../config.json");
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const GoalBlock = goals.GoalBlock;
var mcData;

class CactusBot {
    constructor(botID) {
        let username = config.settings.username + botID.toString();
        this.bot = mineflayer.createBot({
            host: "localhost",
            port: config.settings.portNumber,
            username: username,
            version: config.settings.version
        });
        this.initBasicEventListeners();
    }

    // --- Initializes basic event listeners
    initBasicEventListeners() {
        this.bot.on("death", () => {
            console.log(`${this.bot.username} died`);
        });

        this.bot.on("kicked", (reason, loggedIn) => {
            console.log(`${this.bot.username} kicked`);
            console.log(reason, loggedIn);
        });

        this.bot.on("error", err => {
            console.log(`${this.bot.username} error`);
            console.log(err);
        });

        this.bot.once("spawn", async () => {
            await this.onSpawn();
        });

        // --- bot command listener
        this.bot.on("chat", async (username, message) => {
            if ((username == this.bot.username) || !message.startsWith("cactus")) return;

            let tokens = message.split(" ").slice(1);

            switch(tokens[0]) {
                case "goto":
                    this.onGoto(tokens);
                case "build":
            }
        });
    }

    onSpawn() {
        mcData = require('minecraft-data')(this.bot.version);
        this.bot.loadPlugin(pathfinder);
        let movements = new Movements(this.bot, mcData);
        this.bot.pathfinder.setMovements(movements);
        movements.canDig = false;
    }
    
    async onGoto(tokens) {
        return;
    }

    async gotoGoalBlock(x, y, z) {
        try {
            let goal = new GoalBlock(x, y, z);
            await this.bot.pathfinder.goto(goal, true);
        } catch(e) {
            console.log(e);
        }
    }
}

module.exports = CactusBot;