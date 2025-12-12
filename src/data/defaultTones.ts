import { ToneDefinition } from '../types';

export const DEFAULT_TONES: ToneDefinition[] = [
    {
        id: 't1',
        name: 'Neutral Descriptive Prose',
        description: 'Clear, atmospheric third-person narration for rules and setting text.',
        instruction: 'Write in third-person past tense with a neutral, observant voice. Prioritise clarity and readability. Use concrete details and controlled, vivid imagery so the world feels solid and functional at the table. Avoid slang, heavy slangy voice, or dense purple prose. This tone is ideal for rule explanations, location descriptions, and general setting overview.',
        i18n: {
            'Chinese': {
                name: '中性描述散文',
                description: '清晰、充满氛围的第三人称叙述，用于规则和设定文本。',
                instruction: '使用第三人称过去时，保持中立、客观的口吻。优先考虑清晰度和可读性。使用具体细节和受控的生动意象，使世界在桌面上感觉坚实且功能齐全。避免俚语、过于口语化或辞藻堆砌。这种基调非常适合规则解释、地点描述和通用设定概览。'
            },
            'English': {
                name: 'Neutral Descriptive Prose',
                description: 'Clear, atmospheric third-person narration for rules and setting text.',
                instruction: 'Write in third-person past tense with a neutral, observant voice. Prioritise clarity and readability. Use concrete details and controlled, vivid imagery so the world feels solid and functional at the table. Avoid slang, heavy slangy voice, or dense purple prose. This tone is ideal for rule explanations, location descriptions, and general setting overview.'
            }
        }
    },
    {
        id: 't2',
        name: 'Cinematic Storytelling',
        description: 'Film-like, visual narration for flavour scenes and examples of play.',
        instruction: 'Write as if directing a film: an external “camera” moves through the scene, focusing on motion, visuals, and sensory impressions. Emphasise pacing, action beats, and striking imagery. Reveal information through what the camera notices rather than exposition dumps. This tone is ideal for opening vignettes, in-world stories, and examples of play that show how the game feels in action.',
        i18n: {
            'Chinese': {
                name: '电影化叙事',
                description: '电影般的视觉叙述，用于氛围场景和游玩示例。',
                instruction: '像导演电影一样写作：外部“摄像机”在场景中移动，专注于动作、视觉效果和感官印象。强调节奏、动作节拍和震撼的意象。通过镜头注意到的内容而不是通过说明性倾倒来揭示信息。这种基调非常适合开场小插曲、世界内的故事和展示游戏实际感觉的游玩示例。'
            },
            'English': {
                name: 'Cinematic Storytelling',
                description: 'Film-like, visual narration for flavour scenes and examples of play.',
                instruction: 'Write as if directing a film: an external “camera” moves through the scene, focusing on motion, visuals, and sensory impressions. Emphasise pacing, action beats, and striking imagery. Reveal information through what the camera notices rather than exposition dumps. This tone is ideal for opening vignettes, in-world stories, and examples of play that show how the game feels in action.'
            }
        }
    },
    {
        id: 't3',
        name: 'In-World Document',
        description: 'Diegetic letters, reports, logs, and codices from inside the setting.',
        instruction: 'Write as an in-world document: a letter, field report, captain’s log, scholar’s note, or similar. The writer has a personality and agenda; let their biases, priorities, and omissions shape the text. Keep structure clear, but allow subtle hints of wider events and tensions to leak through. This tone is ideal for lore fragments, sidebars, artefact descriptions, and snippets that make the setting feel lived-in.',
        i18n: {
            'Chinese': {
                name: '世界内文档',
                description: '来自设定内部的信件、报告、日志和手稿。',
                instruction: '作为世界内的文档撰写：信件、实地报告、船长日志、学者笔记等。作者有个性和议程；让他们的偏见、优先事项和遗漏塑造文本。保持结构清晰，但允许更广泛事件和紧张局势的微妙暗示渗透进来。这种基调非常适合传说片段、侧边栏、神器描述以及使设定感觉栩栩如生的片段。'
            },
            'English': {
                name: 'In-World Document',
                description: 'Diegetic letters, reports, logs, and codices from inside the setting.',
                instruction: 'Write as an in-world document: a letter, field report, captain’s log, scholar’s note, or similar. The writer has a personality and agenda; let their biases, priorities, and omissions shape the text. Keep structure clear, but allow subtle hints of wider events and tensions to leak through. This tone is ideal for lore fragments, sidebars, artefact descriptions, and snippets that make the setting feel lived-in.'
            }
        }
    }
];