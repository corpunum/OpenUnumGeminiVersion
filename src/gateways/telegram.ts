import { Bot } from "grammy";
import { OpenUnumAgent } from "../core/agent.ts";

export function startTelegramGateway(token: string, agent: OpenUnumAgent) {
  const bot = new Bot(token);

  bot.on("message:text", async (ctx) => {
    const userMessage = ctx.message.text;
    console.log(`[Telegram] Received: ${userMessage}`);
    
    try {
      await ctx.replyWithChatAction("typing");
      const response = await agent.step(userMessage);
      await ctx.reply(response);
    } catch (err: any) {
      console.error(`[Telegram] Error: ${err.message}`);
      await ctx.reply("Sorry, I encountered an error processing that request.");
    }
  });

  bot.start();
  console.log("Telegram Gateway started.");
}
