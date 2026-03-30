import makeWASocket, { DisconnectReason, useMultiFileAuthState } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { OpenUnumAgent } from "../core/agent.ts";
import path from "node:path";

export async function startWhatsappGateway(agent: OpenUnumAgent) {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(process.cwd(), "auth_info_baileys"));

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("connection closed due to ", lastDisconnect?.error, ", reconnecting ", shouldReconnect);
      if (shouldReconnect) {
        startWhatsappGateway(agent);
      }
    } else if (connection === "open") {
      console.log("WhatsApp connection opened.");
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async (m) => {
    if (m.type === "notify") {
      for (const msg of m.messages) {
        if (!msg.key.fromMe && msg.message?.conversation) {
          const userMessage = msg.message.conversation;
          const remoteJid = msg.key.remoteJid!;
          console.log(`[WhatsApp] Received from ${remoteJid}: ${userMessage}`);

          try {
            const response = await agent.step(userMessage);
            await sock.sendMessage(remoteJid, { text: response });
          } catch (err: any) {
            console.error(`[WhatsApp] Error: ${err.message}`);
          }
        }
      }
    }
  });
}
