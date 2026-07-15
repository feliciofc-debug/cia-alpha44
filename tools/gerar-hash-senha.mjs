#!/usr/bin/env node
/**
 * Gera hash bcrypt para montar CIA_USERS na API.
 * Uso: node tools/gerar-hash-senha.mjs <senha>
 * Ex.: CIA_USERS="felicio@cia.com.br:$(node tools/gerar-hash-senha.mjs minhaSenha)"
 */
import bcrypt from "bcryptjs";

const senha = process.argv[2];
if (!senha) {
  console.error("Uso: node tools/gerar-hash-senha.mjs <senha>");
  process.exit(1);
}

const hash = await bcrypt.hash(senha, 12);
console.log(hash);
