"""Gera supabase/functions/crm-ativacao/skill.ts a partir da skill vert-closer."""
import re
from pathlib import Path

raiz = Path(__file__).resolve().parent.parent
skill = (raiz / ".claude/skills/vert-closer/SKILL.md").read_text(encoding="utf-8")
corpo = re.sub(r"^---\n.*?\n---\n", "", skill, flags=re.S).strip()
assert "¦" not in corpo and "${" not in corpo and "\\" not in corpo
saida = raiz / "supabase/functions/crm-ativacao/skill.ts"
saida.write_text(
    "// Gerado de .claude/skills/vert-closer/SKILL.md (skill VERT Closer Intelligence).\n"
    "// É o manual comercial que o Claude segue no copiloto do CRM. Para mudar,\n"
    "// edite a skill e gere de novo:\n"
    "//   python3 scripts/gerar-skill-closer.py\n"
    "// O texto fica num template literal com ¦ no lugar da crase, para o arquivo\n"
    "// não ter barras nem crases (fica fácil de publicar).\n"
    f"export const SKILL_VERT_CLOSER = `{corpo.replace('`', '¦')}`.replaceAll(\"¦\", String.fromCharCode(96));\n",
    encoding="utf-8",
)
print(f"ok: {saida} ({len(corpo)} caracteres)")
