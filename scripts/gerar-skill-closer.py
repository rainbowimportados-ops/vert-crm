"""Gera supabase/functions/crm-ativacao/skill.ts a partir da skill vert-closer."""
import json
import re
from pathlib import Path

raiz = Path(__file__).resolve().parent.parent
skill = (raiz / ".claude/skills/vert-closer/SKILL.md").read_text(encoding="utf-8")
corpo = re.sub(r"^---\n.*?\n---\n", "", skill, flags=re.S).strip()
saida = raiz / "supabase/functions/crm-ativacao/skill.ts"
saida.write_text(
    "// Gerado de .claude/skills/vert-closer/SKILL.md (skill VERT Closer Intelligence).\n"
    "// É o manual comercial que o Claude segue no copiloto do CRM. Para mudar,\n"
    "// edite a skill e gere de novo:\n"
    "//   python3 scripts/gerar-skill-closer.py\n"
    f"export const SKILL_VERT_CLOSER = {json.dumps(corpo, ensure_ascii=False)};\n",
    encoding="utf-8",
)
print(f"ok: {saida} ({len(corpo)} caracteres)")
