#!/usr/bin/env node

/**
 * MCP Server for PagSeguro/PagBank — Brazilian payment platform.
 *
 * Tools:
 * - create_order: Create an order (Pix, boleto, or credit card)
 * - get_order: Get order details by ID
 * - list_orders: List orders with filters
 * - create_charge: Create a standalone charge
 * - refund: Refund a charge (full or partial)
 * - get_pix_qrcode: Get Pix QR code payload for an order
 * - create_customer: Create a customer
 * - get_balance: Get account balance
 *
 * Environment:
 *   PAGSEGURO_TOKEN — Bearer token from https://pagseguro.uol.com.br/
 *   PAGSEGURO_SANDBOX — "true" to use sandbox (default: false)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const TOKEN = process.env.PAGSEGURO_TOKEN || "";
const BASE_URL = process.env.PAGSEGURO_SANDBOX === "true"
  ? "https://sandbox.api.pagseguro.com"
  : "https://api.pagseguro.com";

async function pagseguroRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PagSeguro API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-pagseguro", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_order",
      description: "Create an order in PagSeguro (Pix, boleto, or credit card)",
      inputSchema: {
        type: "object",
        properties: {
          reference_id: { type: "string", description: "Your unique reference ID" },
          customer: {
            type: "object",
            description: "Customer data",
            properties: {
              name: { type: "string", description: "Customer name" },
              email: { type: "string", description: "Email address" },
              tax_id: { type: "string", description: "CPF or CNPJ (numbers only)" },
            },
            required: ["name", "email", "tax_id"],
          },
          items: {
            type: "array",
            description: "Order items",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Item name" },
                quantity: { type: "number", description: "Quantity" },
                unit_amount: { type: "number", description: "Unit price in cents (BRL)" },
              },
              required: ["name", "quantity", "unit_amount"],
            },
          },
          charges: {
            type: "array",
            description: "Payment charges (Pix, boleto, or card)",
            items: {
              type: "object",
              properties: {
                reference_id: { type: "string", description: "Charge reference" },
                amount: {
                  type: "object",
                  properties: {
                    value: { type: "number", description: "Amount in cents" },
                    currency: { type: "string", description: "Currency (BRL)" },
                  },
                  required: ["value"],
                },
                payment_method: {
                  type: "object",
                  description: "Payment method configuration",
                  properties: {
                    type: { type: "string", enum: ["PIX", "BOLETO", "CREDIT_CARD", "DEBIT_CARD"], description: "Payment type" },
                  },
                  required: ["type"],
                },
              },
              required: ["amount", "payment_method"],
            },
          },
        },
        required: ["customer", "items"],
      },
    },
    {
      name: "get_order",
      description: "Get order details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Order ID (ORDE_xxx)" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_orders",
      description: "List orders with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          reference_id: { type: "string", description: "Filter by reference ID" },
          status: { type: "string", enum: ["CREATED", "PAID", "CANCELED", "IN_ANALYSIS"], description: "Filter by status" },
          limit: { type: "number", description: "Number of results (default 20)" },
          offset: { type: "number", description: "Pagination offset" },
        },
      },
    },
    {
      name: "create_charge",
      description: "Create a standalone charge",
      inputSchema: {
        type: "object",
        properties: {
          reference_id: { type: "string", description: "Your reference ID" },
          amount: {
            type: "object",
            properties: {
              value: { type: "number", description: "Amount in cents (BRL)" },
              currency: { type: "string", description: "Currency (BRL)" },
            },
            required: ["value"],
          },
          payment_method: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["PIX", "BOLETO", "CREDIT_CARD"], description: "Payment type" },
            },
            required: ["type"],
          },
        },
        required: ["amount", "payment_method"],
      },
    },
    {
      name: "refund",
      description: "Refund a charge (full or partial)",
      inputSchema: {
        type: "object",
        properties: {
          charge_id: { type: "string", description: "Charge ID (CHAR_xxx)" },
          amount: {
            type: "object",
            properties: {
              value: { type: "number", description: "Refund amount in cents (omit for full refund)" },
            },
          },
        },
        required: ["charge_id"],
      },
    },
    {
      name: "get_pix_qrcode",
      description: "Get Pix QR code payload and image for an order charge",
      inputSchema: {
        type: "object",
        properties: {
          charge_id: { type: "string", description: "Charge ID" },
        },
        required: ["charge_id"],
      },
    },
    {
      name: "create_customer",
      description: "Create a customer in PagSeguro",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Customer name" },
          email: { type: "string", description: "Email address" },
          tax_id: { type: "string", description: "CPF or CNPJ (numbers only)" },
          phones: {
            type: "array",
            description: "Phone numbers",
            items: {
              type: "object",
              properties: {
                country: { type: "string", description: "Country code (55)" },
                area: { type: "string", description: "Area code (DDD)" },
                number: { type: "string", description: "Phone number" },
                type: { type: "string", enum: ["MOBILE", "BUSINESS", "HOME"], description: "Phone type" },
              },
              required: ["country", "area", "number"],
            },
          },
        },
        required: ["name", "email", "tax_id"],
      },
    },
    {
      name: "get_balance",
      description: "Get account balance",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_order":
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("POST", "/orders", args), null, 2) }] };
      case "get_order":
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("GET", `/orders/${args?.id}`), null, 2) }] };
      case "list_orders": {
        const params = new URLSearchParams();
        if (args?.reference_id) params.set("reference_id", String(args.reference_id));
        if (args?.status) params.set("status", String(args.status));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.offset) params.set("offset", String(args.offset));
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("GET", `/orders?${params}`), null, 2) }] };
      }
      case "create_charge":
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("POST", "/charges", args), null, 2) }] };
      case "refund": {
        const { charge_id, ...refundBody } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("POST", `/charges/${charge_id}/cancel`, refundBody), null, 2) }] };
      }
      case "get_pix_qrcode":
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("GET", `/charges/${args?.charge_id}/qrcodes`), null, 2) }] };
      case "create_customer":
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("POST", "/customers", args), null, 2) }] };
      case "get_balance":
        return { content: [{ type: "text", text: JSON.stringify(await pagseguroRequest("GET", "/balance"), null, 2) }] };
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

async function main() {
  if (!TOKEN) {
    console.error("PAGSEGURO_TOKEN environment variable is required");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
