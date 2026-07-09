export interface ActionTrigger {
    type: string;
    patterns: RegExp[];
    priority: number;
    label: string;
    promptInstruction: string;
    answerStyle?: {
        maxWords: number;
        format: 'bullets' | 'short_script' | 'code' | 'checklist' | 'summary';
        tone: string;
    };
}

// Fact Check (F5, Cluely parity). Shared across GENERAL / SALES / TEAM packs:
// fires when someone disputes a claim or states a confident checkable fact
// (statistics, "studies show", "the docs say"). The instruction mandates
// uncertainty language — no live internet, so never assert false confidence.
const FACT_CHECK_TRIGGER: ActionTrigger = {
    type: 'fact_check',
    patterns: [
        /\b(is that (?:actually |really |even )?(?:true|right|correct|accurate))\b/i,
        /\b(fact[- ]?check|double[- ]?check that|verify that (?:claim|number|stat))\b/i,
        /\b(that (?:doesn'?t|does not) (?:sound|seem) (?:right|correct|accurate|true))\b/i,
        /\b(are you sure (?:that|about|it))\b/i,
        /\b(pretty sure (?:that|it|the)|I read (?:somewhere )?that|studies show|according to (?:a|the) (?:study|report|docs|documentation)|the docs say|statistics (?:show|say))\b/i,
        /\b(where did you get that (?:number|figure|stat))\b/i,
    ],
    priority: 0.83,
    label: 'Fact check claim',
    promptInstruction:
        'Fact-check the MOST RECENT verifiable factual claim in the conversation. Output: the claim (quoted), a verdict — Accurate, Inaccurate, or Unverifiable — and one line of correction or context. You have no live internet access: when not certain, use uncertainty language ("likely", "as far as I know") or mark it Unverifiable. Never invent sources or statistics. Under 120 words.',
    answerStyle: { maxWords: 120, format: 'bullets', tone: 'neutral' },
};

const GENERAL_TRIGGERS: ActionTrigger[] = [
    FACT_CHECK_TRIGGER,
    {
        type: 'general_assistance_request',
        patterns: [
            /\b(can you help me|help me with|what should I say|how should I respond|how do I answer)\b/i,
        ],
        priority: 0.82,
        label: 'Suggest response',
        promptInstruction:
            'You are in General mode. The user needs help responding. Provide a concise, context-aware answer they can say out loud.',
        answerStyle: { maxWords: 100, format: 'short_script', tone: 'helpful' },
    },
    {
        type: 'general_summarize',
        patterns: [/\b(summarize this|recap this|quick summary|what did they say|what was decided)\b/i],
        priority: 0.78,
        label: 'Summarize discussion',
        promptInstruction:
            'You are in General mode. Summarize the relevant discussion into the fewest useful bullets.',
        answerStyle: { maxWords: 90, format: 'bullets', tone: 'neutral' },
    },
    {
        type: 'general_explain',
        patterns: [/\b(explain that|what does that mean|break that down|in simple terms)\b/i],
        priority: 0.76,
        label: 'Explain clearly',
        promptInstruction:
            'You are in General mode. Explain the current topic plainly and avoid inventing details not present in context.',
        answerStyle: { maxWords: 120, format: 'bullets', tone: 'clear' },
    },
];

const NEGOTIATION_TRIGGERS: ActionTrigger[] = [
    {
        type: 'budget_probe',
        patterns: [/\b(what'?s your budget|budget range|target price|price range|how much can you spend)\b/i],
        priority: 0.88,
        label: 'Handle budget probe',
        promptInstruction:
            'You are in Negotiation mode. Respond to a budget probe without anchoring too low. Ask a calibrated question and protect leverage.',
        answerStyle: { maxWords: 90, format: 'short_script', tone: 'calm' },
    },
    {
        type: 'price_pushback',
        patterns: [/\b(price is too high|too expensive|can you do better|lower the price|discount|cheaper)\b/i],
        priority: 0.9,
        label: 'Counter price pushback',
        promptInstruction:
            'You are in Negotiation mode. The other side is pushing on price. Defend value, trade concessions for commitments, and avoid unilateral discounting.',
        answerStyle: { maxWords: 100, format: 'short_script', tone: 'firm' },
    },
    {
        type: 'final_offer',
        patterns: [/\b(final offer|best and final|take it or leave it|last offer|walk away)\b/i],
        priority: 0.92,
        label: 'Respond to final offer',
        promptInstruction:
            'You are in Negotiation mode. Respond to a final-offer frame by testing constraints, preserving optionality, and proposing a concrete next move.',
        answerStyle: { maxWords: 90, format: 'short_script', tone: 'composed' },
    },
];

// Sales triggers
const SALES_TRIGGERS: ActionTrigger[] = [
    FACT_CHECK_TRIGGER,
    {
        type: 'pricing_objection',
        patterns: [/\b(expensive|too much|budget|price|cost|afford)\b/i],
        priority: 0.9,
        label: 'Handle pricing objection',
        promptInstruction:
            "You are in Sales mode. The prospect has raised a pricing concern. Provide a concise, confident response that addresses value over cost. Include a bridge to next steps.",
        answerStyle: { maxWords: 80, format: 'bullets', tone: 'confident' },
    },
    {
        type: 'competitor_mention',
        patterns: [/\b(Gong|Chorus|ZoomInfo|Salesloft|Outreach|Clari|yeah\.pm)\b/i],
        priority: 0.85,
        label: 'Handle competitor comparison',
        promptInstruction:
            "You are in Sales mode. The prospect mentioned a competitor. Position Natively's advantages confidently without disparaging the competitor.",
        answerStyle: { maxWords: 100, format: 'bullets', tone: 'confident' },
    },
    {
        type: 'buying_signal',
        patterns: [/\b(ready to move|send contract|legal review|next steps|schedule|finalize)\b/i],
        priority: 0.95,
        label: 'Seize buying signal',
        promptInstruction:
            "You are in Sales mode. The prospect is showing strong buying intent. Help finalize the next steps and create urgency.",
        answerStyle: { maxWords: 60, format: 'short_script', tone: 'enthusiastic' },
    },
    {
        type: 'roi_question',
        patterns: [/\b(ROI|return on investment|business case|payback|prove the value|value case)\b/i],
        priority: 0.88,
        label: 'Build ROI case',
        promptInstruction:
            'You are in Sales mode. The prospect is asking for ROI. Tie benefits to measurable business outcomes and ask for their success metric.',
        answerStyle: { maxWords: 100, format: 'bullets', tone: 'consultative' },
    },
    {
        type: 'pricing_request',
        patterns: [/\b(send me pricing|pricing page|quote|proposal|commercials|what does it cost)\b/i],
        priority: 0.86,
        label: 'Frame pricing request',
        promptInstruction:
            'You are in Sales mode. The prospect asked for pricing. Qualify scope before giving numbers and propose a concrete follow-up.',
        answerStyle: { maxWords: 90, format: 'short_script', tone: 'consultative' },
    },
];

// Recruiting triggers
const RECRUITING_TRIGGERS: ActionTrigger[] = [
    {
        type: 'candidate_concern',
        patterns: [/\b(visa|relocation|compensation|offer|start date|security|remote|hybrid)\b/i],
        priority: 0.85,
        label: 'Address candidate concern',
        promptInstruction:
            'You are in Recruiting mode. The candidate has raised a concern. Address it factually and empathetically.',
        answerStyle: { maxWords: 100, format: 'bullets', tone: 'empathetic' },
    },
    {
        type: 'strong_fit_signal',
        patterns: [/\b(excited|love this|exactly what|great fit|perfect match)\b/i],
        priority: 0.9,
        label: 'Reinforce positive signal',
        promptInstruction:
            "You are in Recruiting mode. The candidate is showing strong interest. Reinforce why this role is a great match.",
        answerStyle: { maxWords: 60, format: 'bullets', tone: 'encouraging' },
    },
    {
        type: 'candidate_experience_probe',
        patterns: [/\b(tell me about your experience|walk me through your background|why this role|why are you interested)\b/i],
        priority: 0.84,
        label: 'Guide candidate story',
        promptInstruction:
            'You are in Recruiting mode. Help assess and guide the candidate response around experience, motivation, and fit.',
        answerStyle: { maxWords: 100, format: 'bullets', tone: 'structured' },
    },
];

// Team Meeting triggers
const TEAM_TRIGGERS: ActionTrigger[] = [
    FACT_CHECK_TRIGGER,
    {
        type: 'action_item',
        patterns: [
            /\b(I'll do|I'll send|need to follow up|action item|assigned to|deadline|by Friday|by Monday)\b/i,
        ],
        priority: 0.9,
        label: 'Capture action item',
        promptInstruction:
            'You are in Team Meeting mode. Extract the action item: who will do what by when.',
        answerStyle: { maxWords: 50, format: 'bullets', tone: 'direct' },
    },
    {
        type: 'decision_point',
        patterns: [/\b(decided|going with|let's go|final decision|approved|confirmed)\b/i],
        priority: 0.85,
        label: 'Confirm decision',
        promptInstruction: 'You are in Team Meeting mode. Summarize the decision that was made.',
        answerStyle: { maxWords: 40, format: 'bullets', tone: 'neutral' },
    },
    {
        type: 'blocker_check',
        patterns: [/\b(any blockers|blocked by|stuck on|risk to timeline|what's blocking|dependency)\b/i],
        priority: 0.84,
        label: 'Clarify blocker',
        promptInstruction:
            'You are in Team Meeting mode. Identify the blocker, owner, impact, and next unblock step.',
        answerStyle: { maxWords: 70, format: 'checklist', tone: 'direct' },
    },
    {
        type: 'owner_deadline_check',
        patterns: [/\b(who owns this|owner for this|by when|timeline|ETA|due date)\b/i],
        priority: 0.83,
        label: 'Lock owner and deadline',
        promptInstruction:
            'You are in Team Meeting mode. Turn the discussion into an explicit owner, deliverable, and deadline.',
        answerStyle: { maxWords: 60, format: 'checklist', tone: 'direct' },
    },
];

// Interview triggers
const INTERVIEW_TRIGGERS: ActionTrigger[] = [
    {
        type: 'behavioral_question',
        patterns: [
            /\b(tell me about a time|describe a situation|STAR|leadership|challenge|succeeded|failed)\b/i,
        ],
        priority: 0.9,
        label: 'Answer with STAR story',
        promptInstruction:
            'You are in Interview mode. The interviewer asked a behavioral question. Structure your answer using the STAR method (Situation, Task, Action, Result) with specific metrics.',
        answerStyle: { maxWords: 200, format: 'short_script', tone: 'confident' },
    },
    {
        type: 'intro_pitch',
        patterns: [/\b(tell me about yourself|walk me through your resume|introduce yourself)\b/i],
        priority: 0.88,
        label: 'Craft intro pitch',
        promptInstruction:
            'You are in Interview mode. Create a crisp candidate intro that connects background, strengths, and why this role fits.',
        answerStyle: { maxWords: 160, format: 'short_script', tone: 'confident' },
    },
    {
        type: 'company_motivation',
        patterns: [/\b(why this company|why do you want to work here|why us|what interests you about us)\b/i],
        priority: 0.86,
        label: 'Answer company motivation',
        promptInstruction:
            'You are in Interview mode. Answer why this company using concrete signals from the conversation and avoid generic flattery.',
        answerStyle: { maxWords: 140, format: 'short_script', tone: 'authentic' },
    },
    {
        type: 'weakness_question',
        patterns: [/\b(strengths and weaknesses|biggest weakness|area for improvement|weakness)\b/i],
        priority: 0.84,
        label: 'Handle weakness question',
        promptInstruction:
            'You are in Interview mode. Answer the weakness question honestly with a real mitigation and evidence of progress.',
        answerStyle: { maxWords: 140, format: 'short_script', tone: 'reflective' },
    },
];

// Lecture triggers
const LECTURE_TRIGGERS: ActionTrigger[] = [
    {
        type: 'concept_explanation',
        patterns: [/\b(this is called|definition|define|formula|theorem|principle|concept|explain the concept)\b/i],
        priority: 0.85,
        label: 'Explain concept',
        promptInstruction:
            'You are in Lecture mode. Explain the concept clearly with a practical example.',
        answerStyle: { maxWords: 150, format: 'bullets', tone: 'educational' },
    },
    {
        type: 'worked_example',
        patterns: [/\b(example of|for example|worked example|sample problem|practice problem)\b/i],
        priority: 0.82,
        label: 'Create worked example',
        promptInstruction:
            'You are in Lecture mode. Turn the concept into a worked example with steps and the intuition behind each step.',
        answerStyle: { maxWords: 180, format: 'bullets', tone: 'educational' },
    },
];

// Technical Interview triggers
const TECHNICAL_TRIGGERS: ActionTrigger[] = [
    {
        type: 'coding_problem',
        patterns: [/\b(implement|write code|solve|function|algorithm|data structure)\b/i],
        priority: 0.95,
        label: 'Solve coding problem',
        promptInstruction:
            'You are in Technical Interview mode. Provide a clear, efficient solution with time/space complexity analysis.',
        answerStyle: { maxWords: 300, format: 'code', tone: 'analytical' },
    },
    {
        type: 'screen_coding_problem',
        patterns: [/\b(screen|visible|shown|popup|error message|output|on screen)\b/i],
        priority: 0.92,
        label: 'Answer from screen',
        promptInstruction:
            'You are in Technical Interview mode. A coding problem is visible on the screen. Read the visible problem carefully and provide a solution.',
    },
    {
        type: 'complexity_analysis',
        patterns: [/\b(time complexity|space complexity|big o|runtime|optimize|more efficient)\b/i],
        priority: 0.9,
        label: 'Analyze complexity',
        promptInstruction:
            'You are in Technical Interview mode. Explain the complexity tradeoff clearly and suggest the next optimization path.',
        answerStyle: { maxWords: 180, format: 'bullets', tone: 'analytical' },
    },
    {
        type: 'system_design_prompt',
        patterns: [/\b(design a system|system design|architecture|scale to|distributed|throughput)\b/i],
        priority: 0.89,
        label: 'Structure system design',
        promptInstruction:
            'You are in Technical Interview mode. Structure the system design answer around requirements, APIs, data model, scaling, and tradeoffs.',
        answerStyle: { maxWords: 260, format: 'bullets', tone: 'analytical' },
    },
    // ── Coding-interview follow-up pack (F9) ────────────────────────────────
    // The moments right AFTER the initial solution — where interviewers probe
    // optimization, edge cases, walkthroughs, and testing — are where live help
    // matters most. Patterns target interviewer phrasing, not the candidate's.
    {
        type: 'optimization_followup',
        patterns: [
            /\b(can (?:you|we) (?:do|make|get) (?:it|this|that) (?:any )?(?:faster|better|more efficient))\b/i,
            /\b(do (?:it|this|that) in|solve (?:it|this|that) in|get (?:it|this) down to)\s+O\s*\(/i,
            /\b(without (?:the )?(?:extra|additional) (?:space|memory|array|hash\s?map|hashmap))\b/i,
            /\b(in (?:constant|linear|logarithmic|log) (?:time|space))\b/i,
            /\b(is there a (?:faster|better|more (?:efficient|optimal)) (?:way|approach|solution))\b/i,
            /\b(reduce the (?:time|space) complexity)\b/i,
        ],
        priority: 0.94,
        label: 'Optimize solution',
        promptInstruction:
            'You are in Technical Interview mode. The interviewer is asking for a MORE OPTIMAL solution than the current one. State the improved approach and the key insight enabling it, give the new time/space complexity vs the old, and show only the code that changes.',
        answerStyle: { maxWords: 220, format: 'code', tone: 'analytical' },
    },
    {
        type: 'edge_case_probe',
        patterns: [
            /\b(edge cases?|corner cases?|boundary (?:conditions?|cases?))\b/i,
            /\bwhat (?:happens|about) (?:if|when) (?:the (?:input|array|list|string|tree) is )?(?:empty|null|nil|none|negative|zero|duplicates?|very large)\b/i,
            /\b(does (?:it|this|that) (?:handle|work (?:for|with)))\b.{0,40}\b(empty|null|duplicates?|negative|overflow|single element)\b/i,
            /\b(what if there (?:are|is) no)\b/i,
        ],
        priority: 0.9,
        label: 'Cover edge cases',
        promptInstruction:
            'You are in Technical Interview mode. The interviewer is probing edge cases. List the edge cases that matter for THIS problem (empty/null input, single element, duplicates, extremes/overflow, invalid input as applicable), state how the current solution behaves on each, and give the minimal fix for any it fails.',
        answerStyle: { maxWords: 160, format: 'bullets', tone: 'analytical' },
    },
    {
        type: 'code_walkthrough',
        patterns: [
            /\b(walk (?:me|us) through (?:your|the|this) (?:code|solution|approach|logic))\b/i,
            /\b(explain (?:your|the|this) (?:code|solution|approach) (?:to me|line by line|step by step))\b/i,
            /\b(talk (?:me|us) through (?:it|your (?:code|solution|thinking)))\b/i,
            /\b(why did you (?:choose|use|pick|go with))\b/i,
            /\b(what does (?:this|that|the) (?:line|loop|function|variable|part) do)\b/i,
        ],
        priority: 0.91,
        label: 'Walk through code',
        promptInstruction:
            'You are in Technical Interview mode. The interviewer wants a walkthrough of the existing solution. Narrate it in speakable first person: the high-level strategy in one sentence, then each logical step and WHY it is there, using a small concrete input as the running example. No new code.',
        answerStyle: { maxWords: 200, format: 'short_script', tone: 'confident' },
    },
    {
        type: 'testing_probe',
        patterns: [
            /\b(how would you test (?:this|that|it|your (?:code|solution|function)))\b/i,
            /\b(write (?:some|a few|the) (?:unit )?tests?)\b/i,
            /\b(what test cases?)\b/i,
            /\b(how do you know (?:it|this|that) (?:works|is correct))\b/i,
        ],
        priority: 0.86,
        label: 'Propose test cases',
        promptInstruction:
            'You are in Technical Interview mode. The interviewer is asking about testing. Propose a compact test plan for THIS solution: happy path, boundary cases, and failure/invalid input, each with concrete input → expected output. Mention property-based or stress testing only if genuinely relevant.',
        answerStyle: { maxWords: 160, format: 'bullets', tone: 'analytical' },
    },
    {
        type: 'behavioral_pivot',
        patterns: [
            /\b(tell (?:me|us) about a time)\b/i,
            /\b(describe a (?:time|situation|project) (?:when|where))\b/i,
            /\b(have you ever (?:had|worked|dealt|faced|led))\b/i,
            /\b(what(?:'s| is) the (?:hardest|most challenging) (?:bug|problem|project) you)\b/i,
            /\b(how do you handle (?:conflict|disagreement|feedback|pressure|deadlines))\b/i,
        ],
        priority: 0.87,
        label: 'Answer behavioral question',
        promptInstruction:
            'You are in Technical Interview mode but the interviewer just pivoted to a BEHAVIORAL question. Answer in first person using the STAR shape (situation, task, action, result) grounded in the candidate profile if available — never invent employers, projects, or metrics. Keep it speakable and specific.',
        answerStyle: { maxWords: 180, format: 'short_script', tone: 'authentic' },
    },
];

export const MODE_TRIGGERS: Record<string, ActionTrigger[]> = {
    general: GENERAL_TRIGGERS,
    negotiation: NEGOTIATION_TRIGGERS,
    sales: SALES_TRIGGERS,
    recruiting: RECRUITING_TRIGGERS,
    team_meeting: TEAM_TRIGGERS,
    interview: INTERVIEW_TRIGGERS,
    lecture: LECTURE_TRIGGERS,
    technical_interview: TECHNICAL_TRIGGERS,
};

export class DynamicActionDetector {
    private triggers: Record<string, ActionTrigger[]>;

    constructor(triggers: Record<string, ActionTrigger[]> = MODE_TRIGGERS) {
        this.triggers = triggers;
    }

    detectTriggers(params: {
        transcript: string;
        modeTemplateType: string;
    }): Array<{ trigger: ActionTrigger; match: string; index: number }> {
        const { transcript, modeTemplateType } = params;
        const matchedTriggers: Array<{ trigger: ActionTrigger; match: string; index: number }> = [];

        // Get triggers for this mode, fallback to empty array
        const modeTriggers = this.triggers[modeTemplateType] || [];

        for (const trigger of modeTriggers) {
            for (const pattern of trigger.patterns) {
                const match = pattern.exec(transcript);
                if (match) {
                    matchedTriggers.push({
                        trigger,
                        match: match[0],
                        index: match.index,
                    });
                    break; // Only use first matching pattern per trigger
                }
            }
        }

        return matchedTriggers;
    }

    getTriggerForType(type: string): ActionTrigger | undefined {
        for (const triggers of Object.values(this.triggers)) {
            const found = triggers.find((t) => t.type === type);
            if (found) return found;
        }
        return undefined;
    }
}