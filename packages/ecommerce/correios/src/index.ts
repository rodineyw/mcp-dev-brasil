#!/usr/bin/env node

/**
 * MCP Server for Correios — Brazilian postal service.
 *
 * Tools:
 * - track_package: Track a package by tracking code
 * - calculate_shipping: Calculate shipping rates
 * - get_delivery_time: Get estimated delivery time
 * - list_services: List available shipping services
 * - find_cep: Look up address by CEP
 * - create_prepost: Create a pre-posting order
 *
 * Environment:
 *   CORREIOS_USER — Correios API username
 *   CORREIOS_TOKEN — Correios API token
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const USER = process.env.CORREIOS_USER || "";
const TOKEN = process.env.CORREIOS_TOKEN || "";
const BASE_URL = "https://api.correios.com.br";

let authToken = "";
let tokenExpiry = 0;

async function authenticate(): Promise<string> {
  if (authToken && Date.now() < tokenExpiry) return authToken;

  const res = await fetch(`${BASE_URL}/token/v1/autentica/cartaopostagem`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Basic " + btoa(`${USER}:${TOKEN}`),
    },
    body: JSON.stringify({ numero: USER }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Correios Auth ${res.status}: ${err}`);
  }
  const data = await res.json() as { token: string; expiraEm: string };
  authToken = data.token;
  tokenExpiry = new Date(data.expiraEm).getTime() - 60000;
  return authToken;
}

async function correiosRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = await authenticate();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Correios API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-correios", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "track_package",
      description: "Track a package by Correios tracking code",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "Tracking code (e.g. SS987654321BR)" },
        },
        required: ["code"],
      },
    },
    {
      name: "calculate_shipping",
      description: "Calculate shipping rates between two CEPs",
      inputSchema: {
        type: "object",
        properties: {
          cepOrigem: { type: "string", description: "Origin CEP" },
          cepDestino: { type: "string", description: "Destination CEP" },
          peso: { type: "number", description: "Weight in grams" },
          comprimento: { type: "number", description: "Length in cm" },
          altura: { type: "number", description: "Height in cm" },
          largura: { type: "number", description: "Width in cm" },
          servicos: {
            type: "array",
            items: { type: "string" },
            description: "Service codes (e.g. ['04014', '04510'])",
          },
        },
        required: ["cepOrigem", "cepDestino", "peso"],
      },
    },
    {
      name: "get_delivery_time",
      description: "Get estimated delivery time between two CEPs",
      inputSchema: {
        type: "object",
        properties: {
          cepOrigem: { type: "string", description: "Origin CEP" },
          cepDestino: { type: "string", description: "Destination CEP" },
          codigoServico: { type: "string", description: "Service code" },
        },
        required: ["cepOrigem", "cepDestino", "codigoServico"],
      },
    },
    {
      name: "list_services",
      description: "List available Correios shipping services",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "find_cep",
      description: "Look up address by CEP via Correios",
      inputSchema: {
        type: "object",
        properties: {
          cep: { type: "string", description: "CEP (8 digits)" },
        },
        required: ["cep"],
      },
    },
    {
      name: "create_prepost",
      description: "Create a pre-posting order for shipping",
      inputSchema: {
        type: "object",
        properties: {
          codigoServico: { type: "string", description: "Service code" },
          remetente: {
            type: "object",
            description: "Sender info (name, address, CEP, etc.)",
          },
          destinatario: {
            type: "object",
            description: "Recipient info (name, address, CEP, etc.)",
          },
          objetoPostal: {
            type: "object",
            description: "Package details (weight, dimensions, etc.)",
          },
        },
        required: ["codigoServico", "remetente", "destinatario", "objetoPostal"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "track_package":
        return { content: [{ type: "text", text: JSON.stringify(await correiosRequest("GET", `/srorastro/v1/objetos/${args?.code}?resultado=T`), null, 2) }] };
      case "calculate_shipping":
        return { content: [{ type: "text", text: JSON.stringify(await correiosRequest("POST", "/preco/v1/nacional", args), null, 2) }] };
      case "get_delivery_time": {
        const params = new URLSearchParams({
          cepOrigem: String(args?.cepOrigem),
          cepDestino: String(args?.cepDestino),
        });
        return { content: [{ type: "text", text: JSON.stringify(await correiosRequest("GET", `/prazo/v1/nacional/${args?.codigoServico}?${params}`), null, 2) }] };
      }
      case "list_services":
        return { content: [{ type: "text", text: JSON.stringify(await correiosRequest("GET", "/preco/v1/servicos"), null, 2) }] };
      case "find_cep":
        return { content: [{ type: "text", text: JSON.stringify(await correiosRequest("GET", `/cep/v2/enderecos/${args?.cep}`), null, 2) }] };
      case "create_prepost":
        return { content: [{ type: "text", text: JSON.stringify(await correiosRequest("POST", "/prepostagem/v1/prepostagens", args), null, 2) }] };
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

async function main() {
  if (!USER || !TOKEN) {
    console.error("CORREIOS_USER and CORREIOS_TOKEN environment variables are required");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
