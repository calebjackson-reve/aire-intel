# Loop 26 — Handoff Notes

## Definition of Done
- [ ] Route at /api/agents/gmail-lead-detect responds 200
- [ ] When Google not connected: Notification + {ok:true, skipped:"no_gmail"}
- [ ] Unread emails classified by Anthropic
- [ ] New leads created from real estate inquiry emails
- [ ] handleInboundReply called for existing lead emails
- [ ] Notification with summary

## Notes
- Use Gmail REST API directly (not googleapis npm)
- Token: same GOOGLE_ACCESS_TOKEN from Setting table (google.ts/google-calendar.ts pattern)
- Gmail list endpoint: GET https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread newer_than:1d
- Gmail get message: GET https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From
- Classification prompt: "Is this email a real estate inquiry? Reply JSON: {isRE: boolean, confidence: 0-1}"
- Use claude-haiku for speed/cost
- Extract sender email from headers
