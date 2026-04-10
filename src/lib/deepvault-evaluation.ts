import type { EvaluationRow } from './deepvault'

export function buildEvaluationRows(): EvaluationRow[] {
  return [
    { id: 'Q01', query: 'What is the budget for Q3 2025?', expectedSourceId: 'q3-budget', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q02', query: 'Who is the project lead for Project Alpha?', expectedSourceId: 'project-alpha-lead', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q03', query: 'What were the decisions made in the last board meeting?', expectedSourceId: 'board-meeting-notes', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q04', query: 'What are the IT security requirements for remote access?', expectedSourceId: 'remote-access-policy', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q05', query: 'Summarize the Q4 2024 product roadmap.', expectedSourceId: 'product-roadmap-q4-2024', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q06', query: 'What is the onboarding process for new employees?', expectedSourceId: 'onboarding-process', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q07', query: 'What are the current open risks on the Alpha project?', expectedSourceId: 'alpha-risk-register', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q08', query: 'Who approved the infrastructure spend for FY2025?', expectedSourceId: 'infra-spend-approval', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q09', query: 'What is the escalation path for a P1 incident?', expectedSourceId: 'p1-escalation', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q10', query: 'Explain the data classification policy.', expectedSourceId: 'data-classification-policy', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q11', query: 'What tools are approved for use by the engineering team?', expectedSourceId: 'approved-tools-policy', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q12', query: 'What is the deadline for the Q1 2026 compliance audit?', expectedSourceId: 'compliance-audit-deadline', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q13', query: 'Give me a summary of the Alpha project status as of last month.', expectedSourceId: 'alpha-status-report', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q14', query: 'What SharePoint sites are available for the Finance team?', expectedSourceId: null, role: 'analyst', expectedStatus: 'no_answer' },
    { id: 'Q15', query: 'What are the quarterly OKRs for the product team?', expectedSourceId: 'quarterly-okrs', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q16', query: 'Who should I contact for budget approval?', expectedSourceId: 'budget-approval-contact', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q17', query: 'What is the vendor onboarding checklist?', expectedSourceId: 'vendor-onboarding-checklist', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q18', query: 'What are the known issues with the current SSO implementation?', expectedSourceId: 'sso-issues', role: 'analyst', expectedStatus: 'answered' },
    { id: 'Q19', query: 'What are the restricted launch notes for the stealth lab?', expectedSourceId: 'secret-launch-notes', role: 'guest', expectedStatus: 'no_permitted_sources' },
    { id: 'Q20', query: 'What is the cobalt orchard relocation timeline?', expectedSourceId: null, role: 'analyst', expectedStatus: 'no_answer' },
  ]
}

export function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
