---
name: create-skill
description: 'Create a reusable SKILL.md from conversation patterns. Use when turning repeated debugging, review, or implementation workflows into a project skill with steps, branch logic, and quality checks.'
argument-hint: 'Describe the workflow and desired output scope (workspace or personal).'
user-invocable: true
---

# Create Skill From Conversation

## Outcome
- Produce a complete `SKILL.md` that captures a repeatable workflow.
- Extract concrete steps, decision branches, and completion criteria.
- Save the skill in a valid project skill location.

## When to Use
- A conversation reveals a repeated multi-step process.
- A team wants to standardize debugging, review, migration, or release work.
- A checklist has grown into a reliable playbook and should become reusable.

## Procedure
1. Review the conversation and extract the operational pattern.
2. Identify the workflow phases and map them into ordered steps.
3. Record decision points with explicit branch rules.
4. Define quality gates and done criteria for each major phase.
5. Draft frontmatter with strong trigger keywords in `description`.
6. Draft the skill body with concise sections: outcome, when to use, procedure, checks.
7. Save to `.github/skills/<name>/SKILL.md` with folder name matching `name`.
8. Identify weak or ambiguous parts and ask targeted follow-up questions.
9. Revise the skill with user answers and confirm it is production-ready.

## Decision Logic
- If no clear workflow is visible in history:
  - Ask for target outcome, scope (workspace or personal), and depth (checklist or full workflow).
- If workflow is clear but scope is unclear:
  - Draft workspace version first, then ask whether to also create a personal variant.
- If steps exist but quality checks are missing:
  - Add objective validation checks before finalizing.

## Quality Criteria
- Frontmatter is valid YAML and includes `name` and `description`.
- Folder name matches `name` exactly.
- Description includes concrete trigger words for discovery.
- Procedure is executable end-to-end without hidden assumptions.
- Decision branches cover at least no-workflow and unclear-scope cases.
- Completion checks are testable, not subjective.

## Completion Checklist
- `SKILL.md` saved in a valid skills folder.
- Step sequence is explicit and actionable.
- Branch logic is present and unambiguous.
- Quality criteria are present and measurable.
- At least one follow-up question was asked about ambiguity.

## Example Prompts
- "Turn our recurring bug-triage chat flow into a reusable skill."
- "Create a skill from our release checklist with go/no-go gates."
- "Extract a code review workflow from this conversation and save it as SKILL.md."