const CactusBot = require("./CactusBot");
const SecondaryCactusBot = require("./SecondaryCactusBot");
const CactusCalculations = require("./Calculations");
var mcData; // loaded after bot spawns in minecraft server
const vec3 = require("vec3");
const config = require("../config.json");

const BOTS_COUNT = parseInt(config.settings.numberOfBots);
const NUM_OF_TICKS_BOT_SPAWN = 60; 
const NUM_OF_TICKS_JUMP = 12;
const TOP_FACE = vec3(0, 1, 0);
const TOOL_NAME = config.settings.tool;
const FOUNDATION_BLOCK_NAME = config.settings.foundationBlock;
const CACTUS_BREAK_BLOCK_NAME = config.settings.cactusBreakBlock;

class PrimaryCactusBot extends CactusBot {
    constructor(botId) {
        super(botId);
        this.initCommandListener();
        this.secondaryBots = [];
        this.blockIds = {
            cactus: -1,
            sand: -1,
            foundation: -1,
            cactusBreak: -1
        };
        this.toolId = -1;
    }

    async initCommandListener() {
        this.bot.on("chat", async (username, message) => {
            if ((username == this.bot.username) || !message.startsWith("cactus")) return;

            let tokens = message.split(" ").slice(1);

            switch(tokens[0]) {
                case "build":
                    await this.onBuild(tokens);
                    break;
                case "goto":
                    await this.onGoto(tokens);
                    break;
            }
        });
    }

    loadBlockIds() {
        this.blockIds.cactus = this.getBlockID("cactus");
        this.blockIds.sand = this.getBlockID("sand");
        this.blockIds.foundation = this.getBlockID(FOUNDATION_BLOCK_NAME);
        this.blockIds.cactusBreak = this.getBlockID(CACTUS_BREAK_BLOCK_NAME);
    }

    loadToolId() {
        let toolName = TOOL_NAME;
        if (toolName != "") this.toolId = mcData.itemsByName[toolName].id;
    }

    async onSpawn() {
        super.onSpawn();
        mcData = require("minecraft-data")(this.bot.version);
        this.loadBlockIds();
        this.loadToolId();
        for (var i = 2;  i <= BOTS_COUNT; ++i) {
            let newBot = new SecondaryCactusBot(i);
            this.secondaryBots.push(newBot);
            await this.bot.waitForTicks(NUM_OF_TICKS_BOT_SPAWN);
        }
    }

    gotoIsValid(tokens) {
        if (tokens.length != 4) {
            console.log("goto command failed, invalid argument length");
            return false;
        }
        if (!isNaN(tokens[1]) && !isNaN(tokens[2]) && !isNaN(tokens[3])) {
            return true;
        }
        else {
            console.log("goto command failed, invalid arguments for coordinates");
            return false;
        }
    }

    buildIsValid(tokens) {
        if (tokens.length != 2) {
            console.log("build command failed, invalid argument length");
            return false;
        }
        if (isNaN(tokens[1])) {
            console.log("build command failed, invalid arguments for coordinates");
            return false;
        }
        return true;
    }

    // --- Give name of a block as a string returns the mcData blocks id
    getBlockID(blockName) {
        try {
            return mcData.itemsByName[blockName].id;
        } catch(e) {
            this.bot.chat(`Failed, specified block does not exist: ${blockName}`);
            console.log(`getBlock() failed, specified block does not exist: ${blockName}`);
            return -1;
        }
    }

    hasEnoughMaterialsToBuild(startElevation, endElevation, botItems) {
        let numOfLayersToBuild = 
            CactusCalculations.computeNumOfLayersToBuild(startElevation, endElevation);
        let numOfBlocksNeeded = CactusCalculations.computeNumOfBlocksNeeded(numOfLayersToBuild);
        console.log(`${this.bot.username} numOfBlocksNeeded`, numOfBlocksNeeded);
        let numOfBlocksInInventory = CactusCalculations.computeNumOfBlocksInInventory
            (botItems, FOUNDATION_BLOCK_NAME, CACTUS_BREAK_BLOCK_NAME);
        console.log(`${this.bot.username} numOfBlocksInInventory`, numOfBlocksInInventory);
        let numOfBlocksMissing = 
            CactusCalculations.computeNumOfBlocksMissing(numOfBlocksNeeded, numOfBlocksInInventory);
        if (!numOfBlocksMissing) return true;
        let errMsg = ""
        for (let block in numOfBlocksMissing) {
            errMsg += `${block}: ${numOfBlocksMissing[block]} `;
        }
        this.bot.chat(`Failed to build, I am missing ${errMsg}`);
        console.log(`${this.bot.username} failed to build. Missing ${errMsg}`);
        return false;
    }

    async onGoto(tokens) {
        if (!this.gotoIsValid(tokens)) return;
        await this.gotoGoalBlock(tokens[1], tokens[2], tokens[3]);
    }

    async onBuild(tokens) {
        if (!this.buildIsValid(tokens)) return;
        let startElevation = this.bot.entity.position.y;
        let endElevation = tokens[1];
        let botItems = this.bot.inventory.items();
        if (!this.hasEnoughMaterialsToBuild(startElevation, endElevation, botItems)) return;
        let numOfLayersToBuild = 
            CactusCalculations.computeNumOfLayersToBuild(startElevation, endElevation);
        await this.build(numOfLayersToBuild, startElevation);
    }

    async build(numOfLayersToBuild, startElevation) {
        console.log(`${this.bot.username} building ${numOfLayersToBuild} layers`,
            `starting at ${startElevation}`);
        await this.buildFoundationLayer();
        for (var i = 0; i < numOfLayersToBuild; ++i) {
            await this.buildFoundationLayer();
            await this.digFoundationLayer();
            await this.buildSandLayer();
            await this.buildCactusLayer();
            await this.buildCactusBreakLayer();
        }
        await this.digDown(startElevation);
    }

    async buildUp() {
        await this.bot.equip(this.blockIds.foundation, "hand");
        let sourceBlockPosition = this.bot.entity.position.offset(0, -1, 0);
        let sourceBlock = this.bot.blockAt(sourceBlockPosition);
        let goalElevation = Math.floor(this.bot.entity.position.y) + 1;
        await this.bot.lookAt(sourceBlockPosition);
        let tryCount = 0

        while (tryCount < 10) {
            try {
                this.bot.setControlState("jump", true);
                this.bot.setControlState("jump", false);
                while (true) {
                    if (this.bot.entity.position.y >= goalElevation) {
                        await this.bot.placeBlock(sourceBlock, TOP_FACE);
                        break;
                    }
                    await this.bot.waitForTicks(1);
                }
                break;
            } catch(e) {
                await this.bot.waitForTicks(NUM_OF_TICKS_JUMP);
                tryCount += 1;
                if (tryCount == 10) console.log(e);
            }
        }
    }

    async buildCorners(blockID) {
        await this.bot.equip(blockID, "hand");
        let botPosition = this.bot.entity.position;
        await this.bot.placeBlock(this.bot.blockAt(botPosition.offset(1, -0.5, -1)), TOP_FACE);
        await this.bot.placeBlock(this.bot.blockAt(botPosition.offset(1, -0.5, 1)), TOP_FACE);
        await this.bot.placeBlock(this.bot.blockAt(botPosition.offset(-1, -0.5, 1)), TOP_FACE);
        await this.bot.placeBlock(this.bot.blockAt(botPosition.offset(-1, -0.5, -1)), TOP_FACE);
    }

    async buildFoundationLayer() {
        await this.buildCorners(this.blockIds.foundation);
        await this.buildUp();
    }

    async buildSandLayer() {
        await this.buildCorners(this.blockIds.sand);
        await this.buildUp();
    }

    async buildCactusLayer() {
        await this.buildCorners(this.blockIds.cactus);
        await this.buildUp();
    }

    async digFoundationLayer() {
        let botPosition = this.bot.entity.position;
        if (this.toolId >= 0) this.bot.equip(this.toolId, "hand");
        await this.bot.dig(this.bot.blockAt(botPosition.offset(1, -1.5, -1)), false);
        await this.bot.dig(this.bot.blockAt(botPosition.offset(1, -1.5, 1)), false);
        await this.bot.dig(this.bot.blockAt(botPosition.offset(-1, -1.5, 1)), false);
        await this.bot.dig(this.bot.blockAt(botPosition.offset(-1, -1.5, -1)), false);
    }

    async buildCactusBreakLayer() {
        await this.buildCorners(this.blockIds.foundation);
        await this.bot.equip(this.blockIds.cactusBreak, "hand");
        let botPosition = this.bot.entity.position;
        await this.bot.placeBlock(this.bot.blockAt(botPosition.offset(1, 0, -1)), vec3(0, 0, 1));
        await this.bot.placeBlock(this.bot.blockAt(botPosition.offset(-1, 0, 1)), vec3(0, 0, -1));
        await this.buildUp();
    }

    async digDown(startElevation) {
        if (this.toolId >= 0) this.bot.equip(this.toolId, "hand");
        await this.bot.lookAt(this.bot.entity.position.offset(0, -1, 0));
        while (Math.floor(this.bot.entity.position.y) > startElevation) {
            await this.bot.dig(this.bot.blockAt(this.bot.entity.position.offset(0, -1, 0)), true);
        }
    }
}

class Singleton {
    constructor() {
        if (!Singleton.instance) {
            Singleton.instance = new PrimaryCactusBot(1);
        }
        return Singleton.instance
    }
}

module.exports = Singleton;