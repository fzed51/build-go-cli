import chalk from "chalk";

/**
 * Tous les messages du logger partent sur stderr, jamais sur stdout.
 *
 * stdout est réservé à la donnée : le rapport JSON de `--json`, ou le
 * récapitulatif final. Un appelant peut donc toujours parser stdout sans
 * avoir à filtrer les messages de progression.
 */
export const logger = {
  success: (msg: string) => console.error(chalk.green("✓"), msg),
  error: (msg: string) => console.error(chalk.red("✗"), msg),
  warn: (msg: string) => console.error(chalk.yellow("!"), msg),
  info: (msg: string) => console.error(chalk.blue("ℹ"), msg),
  step: (msg: string) => console.error(chalk.cyan("→"), msg),
  debug: (msg: string) => {
    if (process.env.DEBUG) console.error(chalk.gray(msg));
  },
};
