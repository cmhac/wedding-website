# Specification Quality Checklist: Text messages (SMS) for guest sign-in and campaigns

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-26
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [ ] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- 2026-10-29 rewrite: the couple chose personal long-lived invite links sent by email and text (opening one signs the household in), sign-in by email or US phone number with the same kind of link, staying signed in indefinitely, one shared account per household with several emails and phone numbers, and sign-in messages from the repository's own hooks and templates (retiring custom SMTP). Three [NEEDS CLARIFICATION] markers remain: the default cut-off for personal links (FR-005), how text consent is captured (FR-017), and whether Canadian numbers count (FR-031). Staff staying on email only (FR-012) is an assumption to confirm.
- The Assumptions section names Supabase and the sending providers on purpose: they are dependencies the couple already chose or must choose, not implementation design.
- The consent and carrier-registration facts come from vendor and law-firm summaries, not primary sources. They are flagged in Assumptions as needing confirmation before the first campaign text.
