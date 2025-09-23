// src/utils/gerarCpf.js

/**
 * Gera um número de CPF válido seguindo as regras do Brasil.
 * Retorna como string com 11 dígitos (sem formatação).
 */
function gerarCPF() {
  // Gera 9 dígitos aleatórios
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));

  // Calcula os 2 dígitos verificadores
  const d1 = calcularDigito(base, 10);
  const d2 = calcularDigito([...base, d1], 11);

  return [...base, d1, d2].join('');
}

/**
 * Calcula o dígito verificador de um CPF.
 * @param {number[]} numeros - array com os dígitos já existentes
 * @param {number} pesoInicial - peso inicial (10 para 1º dígito, 11 para 2º)
 */
function calcularDigito(numeros, pesoInicial) {
  const soma = numeros.reduce((acc, num, i) => acc + num * (pesoInicial - i), 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

module.exports = { gerarCPF };
