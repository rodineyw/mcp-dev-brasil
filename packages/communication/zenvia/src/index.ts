#!/usr/bin/env node

/**
 * MCP Server for Zenvia — multi-channel messaging (SMS, WhatsApp, RCS).
 *
 * Tools:
 * - send_sms: Send an SMS message
 * - send_whatsapp: Send a WhatsApp message
 * - send_rcs: Send an RCS message
 * - get_message_status: Get message delivery status
 * - list_channels: List available messaging channels
 * - create_subscription: Create a webhook subscription for events
 * - list_contacts: List contacts
 * - send_template: Send a WhatsApp template message
 *
 * Environment:
 *   ZENVIA_API_TOKEN — API token from https://app.zenvia.com/
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_TOKEN = process.env.ZENVIA_API_TOKEN || "";
const BASE_URL = "https://api.zenvia.com/v2";

async function zenviaRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-API-TOKEN": API_TOKEN,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Zenvia API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-zenvia", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "send_sms",
      description: "Send an SMS message",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Sender ID" },
          to: { type: "string", description: "Recipient phone number with country code (e.g. 5511999999999)" },
          text: { type: "string", description: "Message text" },
        },
        required: ["from", "to", "text"],
      },
    },
    {
      name: "send_whatsapp",
      description: "Send a WhatsApp message",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Sender ID (WhatsApp channel)" },
          to: { type: "string", description: "Recipient phone number with country code" },
          text: { type: "string", description: "Message text" },
        },
        required: ["from", "to", "text"],
      },
    },
    {
      name: "send_rcs",
      description: "Send an RCS (Rich Communication Services) message",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Sender ID (RCS channel)" },
          to: { type: "string", description: "Recipient phone number with country code" },
          text: { type: "string", description: "Message text" },
        },
        required: ["from", "to", "text"],
      },
    },
    {
      name: "get_message_status",
      description: "Get message delivery status by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Message ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_channels",
      description: "List available messaging channels",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "create_subscription",
      description: "Create a webhook subscription for message events",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Webhook URL to receive events" },
          channel: { type: "string", enum: ["sms", "whatsapp", "rcs"], description: "Channel to subscribe to" },
          eventType: { type: "string", enum: ["MESSAGE", "MESSAGE_STATUS"], description: "Event type" },
        },
        required: ["url", "channel", "eventType"],
      },
    },
    {
      name: "list_contacts",
      description: "List contacts from the contact base",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          size: { type: "number", description: "Page size" },
        },
      },
    },
    {
      name: "send_template",
      description: "Send a WhatsApp template message (pre-approved)",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Sender ID (WhatsApp channel)" },
          to: { type: "string", description: "Recipient phone number with country code" },
          templateId: { type: "string", description: "Approved template ID" },
          fields: {
            type: "object",
            description: "Template variable values (key-value map)",
          },
        },
        required: ["from", "to", "templateId"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "send_sms":
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("POST", "/channels/sms/messages", { from: args?.from, to: args?.to, contents: [{ type: "text", text: args?.text }] }), null, 2) }] };
      case "send_whatsapp":
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("POST", "/channels/whatsapp/messages", { from: args?.from, to: args?.to, contents: [{ type: "text", text: args?.text }] }), null, 2) }] };
      case "send_rcs":
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("POST", "/channels/rcs/messages", { from: args?.from, to: args?.to, contents: [{ type: "text", text: args?.text }] }), null, 2) }] };
      case "get_message_status":
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("GET", `/reports/${args?.id}`), null, 2) }] };
      case "list_channels":
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("GET", "/channels"), null, 2) }] };
      case "create_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("POST", "/subscriptions", { webhook: { url: args?.url }, criteria: { channel: args?.channel }, eventType: args?.eventType }), null, 2) }] };
      case "list_contacts": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.size) params.set("size", String(args.size));
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("GET", `/contacts?${params}`), null, 2) }] };
      }
      case "send_template":
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("POST", "/channels/whatsapp/messages", { from: args?.from, to: args?.to, contents: [{ type: "template", templateId: args?.templateId, fields: args?.fields || {} }] }), null, 2) }] };
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

async function main() {
  if (!API_TOKEN) {
    console.error("ZENVIA_API_TOKEN environment variable is required");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
