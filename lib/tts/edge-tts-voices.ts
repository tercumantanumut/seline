/**
 * Edge TTS Voice Catalog
 *
 * Curated list of Microsoft Edge TTS neural voices.
 * These are free, no-API-key voices available via the node-edge-tts package.
 * Voice IDs follow the format: {locale}-{Name}Neural
 *
 * Source: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support
 */

export interface EdgeTTSVoice {
  /** Full voice ID, e.g. "en-US-AriaNeural" */
  id: string;
  /** Display name, e.g. "Aria" */
  name: string;
  /** Human-readable language, e.g. "English (US)" */
  language: string;
  /** BCP-47 locale code, e.g. "en-US" */
  locale: string;
  /** Voice gender */
  gender: "Female" | "Male";
}

/**
 * Complete catalog of Edge TTS neural voices, organized by language.
 */
export const EDGE_TTS_VOICES: EdgeTTSVoice[] = [
  // ─── Afrikaans ───
  { id: "af-ZA-AdriNeural", name: "Adri", language: "Afrikaans", locale: "af-ZA", gender: "Female" },
  { id: "af-ZA-WillemNeural", name: "Willem", language: "Afrikaans", locale: "af-ZA", gender: "Male" },

  // ─── Arabic ───
  { id: "ar-SA-ZariyahNeural", name: "Zariyah", language: "Arabic (Saudi)", locale: "ar-SA", gender: "Female" },
  { id: "ar-SA-HamedNeural", name: "Hamed", language: "Arabic (Saudi)", locale: "ar-SA", gender: "Male" },
  { id: "ar-EG-SalmaNeural", name: "Salma", language: "Arabic (Egypt)", locale: "ar-EG", gender: "Female" },
  { id: "ar-EG-ShakirNeural", name: "Shakir", language: "Arabic (Egypt)", locale: "ar-EG", gender: "Male" },
  { id: "ar-AE-FatimaNeural", name: "Fatima", language: "Arabic (UAE)", locale: "ar-AE", gender: "Female" },
  { id: "ar-AE-HamdanNeural", name: "Hamdan", language: "Arabic (UAE)", locale: "ar-AE", gender: "Male" },

  // ─── Bengali ───
  { id: "bn-IN-TanishaaNeural", name: "Tanishaa", language: "Bengali (India)", locale: "bn-IN", gender: "Female" },
  { id: "bn-IN-BashkarNeural", name: "Bashkar", language: "Bengali (India)", locale: "bn-IN", gender: "Male" },
  { id: "bn-BD-NabanitaNeural", name: "Nabanita", language: "Bengali (Bangladesh)", locale: "bn-BD", gender: "Female" },
  { id: "bn-BD-PradeepNeural", name: "Pradeep", language: "Bengali (Bangladesh)", locale: "bn-BD", gender: "Male" },

  // ─── Bulgarian ───
  { id: "bg-BG-KalinaNeural", name: "Kalina", language: "Bulgarian", locale: "bg-BG", gender: "Female" },
  { id: "bg-BG-BorislavNeural", name: "Borislav", language: "Bulgarian", locale: "bg-BG", gender: "Male" },

  // ─── Catalan ───
  { id: "ca-ES-JoanaNeural", name: "Joana", language: "Catalan", locale: "ca-ES", gender: "Female" },
  { id: "ca-ES-EnricNeural", name: "Enric", language: "Catalan", locale: "ca-ES", gender: "Male" },

  // ─── Chinese (Mandarin) ───
  { id: "zh-CN-XiaoxiaoNeural", name: "Xiaoxiao", language: "Chinese (Mandarin)", locale: "zh-CN", gender: "Female" },
  { id: "zh-CN-XiaoyiNeural", name: "Xiaoyi", language: "Chinese (Mandarin)", locale: "zh-CN", gender: "Female" },
  { id: "zh-CN-YunjianNeural", name: "Yunjian", language: "Chinese (Mandarin)", locale: "zh-CN", gender: "Male" },
  { id: "zh-CN-YunxiNeural", name: "Yunxi", language: "Chinese (Mandarin)", locale: "zh-CN", gender: "Male" },
  { id: "zh-CN-YunyangNeural", name: "Yunyang", language: "Chinese (Mandarin)", locale: "zh-CN", gender: "Male" },

  // ─── Chinese (Cantonese) ───
  { id: "zh-HK-HiuMaanNeural", name: "HiuMaan", language: "Chinese (Cantonese)", locale: "zh-HK", gender: "Female" },
  { id: "zh-HK-HiuGaaiNeural", name: "HiuGaai", language: "Chinese (Cantonese)", locale: "zh-HK", gender: "Female" },
  { id: "zh-HK-WanLungNeural", name: "WanLung", language: "Chinese (Cantonese)", locale: "zh-HK", gender: "Male" },

  // ─── Chinese (Taiwanese) ───
  { id: "zh-TW-HsiaoChenNeural", name: "HsiaoChen", language: "Chinese (Taiwanese)", locale: "zh-TW", gender: "Female" },
  { id: "zh-TW-HsiaoYuNeural", name: "HsiaoYu", language: "Chinese (Taiwanese)", locale: "zh-TW", gender: "Female" },
  { id: "zh-TW-YunJheNeural", name: "YunJhe", language: "Chinese (Taiwanese)", locale: "zh-TW", gender: "Male" },

  // ─── Croatian ───
  { id: "hr-HR-GabrijelaNeural", name: "Gabrijela", language: "Croatian", locale: "hr-HR", gender: "Female" },
  { id: "hr-HR-SreckoNeural", name: "Srecko", language: "Croatian", locale: "hr-HR", gender: "Male" },

  // ─── Czech ───
  { id: "cs-CZ-VlastaNeural", name: "Vlasta", language: "Czech", locale: "cs-CZ", gender: "Female" },
  { id: "cs-CZ-AntoninNeural", name: "Antonin", language: "Czech", locale: "cs-CZ", gender: "Male" },

  // ─── Danish ───
  { id: "da-DK-ChristelNeural", name: "Christel", language: "Danish", locale: "da-DK", gender: "Female" },
  { id: "da-DK-JeppeNeural", name: "Jeppe", language: "Danish", locale: "da-DK", gender: "Male" },

  // ─── Dutch ───
  { id: "nl-NL-ColetteNeural", name: "Colette", language: "Dutch", locale: "nl-NL", gender: "Female" },
  { id: "nl-NL-FennaNeural", name: "Fenna", language: "Dutch", locale: "nl-NL", gender: "Female" },
  { id: "nl-NL-MaartenNeural", name: "Maarten", language: "Dutch", locale: "nl-NL", gender: "Male" },
  { id: "nl-BE-DenaNeural", name: "Dena", language: "Dutch (Belgium)", locale: "nl-BE", gender: "Female" },
  { id: "nl-BE-ArnaudNeural", name: "Arnaud", language: "Dutch (Belgium)", locale: "nl-BE", gender: "Male" },

  // ─── English (US) ───
  { id: "en-US-AriaNeural", name: "Aria", language: "English (US)", locale: "en-US", gender: "Female" },
  { id: "en-US-AnaNeural", name: "Ana", language: "English (US)", locale: "en-US", gender: "Female" },
  { id: "en-US-JennyNeural", name: "Jenny", language: "English (US)", locale: "en-US", gender: "Female" },
  { id: "en-US-MichelleNeural", name: "Michelle", language: "English (US)", locale: "en-US", gender: "Female" },
  { id: "en-US-MonicaNeural", name: "Monica", language: "English (US)", locale: "en-US", gender: "Female" },
  { id: "en-US-AmberNeural", name: "Amber", language: "English (US)", locale: "en-US", gender: "Female" },
  { id: "en-US-AshleyNeural", name: "Ashley", language: "English (US)", locale: "en-US", gender: "Female" },
  { id: "en-US-CoraNeural", name: "Cora", language: "English (US)", locale: "en-US", gender: "Female" },
  { id: "en-US-ElizabethNeural", name: "Elizabeth", language: "English (US)", locale: "en-US", gender: "Female" },
  { id: "en-US-SaraNeural", name: "Sara", language: "English (US)", locale: "en-US", gender: "Female" },
  { id: "en-US-GuyNeural", name: "Guy", language: "English (US)", locale: "en-US", gender: "Male" },
  { id: "en-US-DavisNeural", name: "Davis", language: "English (US)", locale: "en-US", gender: "Male" },
  { id: "en-US-BrandonNeural", name: "Brandon", language: "English (US)", locale: "en-US", gender: "Male" },
  { id: "en-US-ChristopherNeural", name: "Christopher", language: "English (US)", locale: "en-US", gender: "Male" },
  { id: "en-US-EricNeural", name: "Eric", language: "English (US)", locale: "en-US", gender: "Male" },
  { id: "en-US-JacobNeural", name: "Jacob", language: "English (US)", locale: "en-US", gender: "Male" },
  { id: "en-US-RogerNeural", name: "Roger", language: "English (US)", locale: "en-US", gender: "Male" },
  { id: "en-US-SteffanNeural", name: "Steffan", language: "English (US)", locale: "en-US", gender: "Male" },
  { id: "en-US-TonyNeural", name: "Tony", language: "English (US)", locale: "en-US", gender: "Male" },
  { id: "en-US-AndrewNeural", name: "Andrew", language: "English (US)", locale: "en-US", gender: "Male" },
  { id: "en-US-BrianNeural", name: "Brian", language: "English (US)", locale: "en-US", gender: "Male" },

  // ─── English (UK) ───
  { id: "en-GB-SoniaNeural", name: "Sonia", language: "English (UK)", locale: "en-GB", gender: "Female" },
  { id: "en-GB-LibbyNeural", name: "Libby", language: "English (UK)", locale: "en-GB", gender: "Female" },
  { id: "en-GB-MaisieNeural", name: "Maisie", language: "English (UK)", locale: "en-GB", gender: "Female" },
  { id: "en-GB-RyanNeural", name: "Ryan", language: "English (UK)", locale: "en-GB", gender: "Male" },
  { id: "en-GB-ThomasNeural", name: "Thomas", language: "English (UK)", locale: "en-GB", gender: "Male" },

  // ─── English (Australia) ───
  { id: "en-AU-NatashaNeural", name: "Natasha", language: "English (Australia)", locale: "en-AU", gender: "Female" },
  { id: "en-AU-WilliamNeural", name: "William", language: "English (Australia)", locale: "en-AU", gender: "Male" },

  // ─── English (India) ───
  { id: "en-IN-NeerjaNeural", name: "Neerja", language: "English (India)", locale: "en-IN", gender: "Female" },
  { id: "en-IN-PrabhatNeural", name: "Prabhat", language: "English (India)", locale: "en-IN", gender: "Male" },

  // ─── English (Ireland) ───
  { id: "en-IE-EmilyNeural", name: "Emily", language: "English (Ireland)", locale: "en-IE", gender: "Female" },
  { id: "en-IE-ConnorNeural", name: "Connor", language: "English (Ireland)", locale: "en-IE", gender: "Male" },

  // ─── English (Canada) ───
  { id: "en-CA-ClaraNeural", name: "Clara", language: "English (Canada)", locale: "en-CA", gender: "Female" },
  { id: "en-CA-LiamNeural", name: "Liam", language: "English (Canada)", locale: "en-CA", gender: "Male" },

  // ─── English (Philippines) ───
  { id: "en-PH-RosaNeural", name: "Rosa", language: "English (Philippines)", locale: "en-PH", gender: "Female" },
  { id: "en-PH-JamesNeural", name: "James", language: "English (Philippines)", locale: "en-PH", gender: "Male" },

  // ─── English (South Africa) ───
  { id: "en-ZA-LeahNeural", name: "Leah", language: "English (South Africa)", locale: "en-ZA", gender: "Female" },
  { id: "en-ZA-LukeNeural", name: "Luke", language: "English (South Africa)", locale: "en-ZA", gender: "Male" },

  // ─── Estonian ───
  { id: "et-EE-AnuNeural", name: "Anu", language: "Estonian", locale: "et-EE", gender: "Female" },
  { id: "et-EE-KertNeural", name: "Kert", language: "Estonian", locale: "et-EE", gender: "Male" },

  // ─── Filipino ───
  { id: "fil-PH-BlessicaNeural", name: "Blessica", language: "Filipino", locale: "fil-PH", gender: "Female" },
  { id: "fil-PH-AngeloNeural", name: "Angelo", language: "Filipino", locale: "fil-PH", gender: "Male" },

  // ─── Finnish ───
  { id: "fi-FI-SelmaNeural", name: "Selma", language: "Finnish", locale: "fi-FI", gender: "Female" },
  { id: "fi-FI-HarriNeural", name: "Harri", language: "Finnish", locale: "fi-FI", gender: "Male" },

  // ─── French (France) ───
  { id: "fr-FR-DeniseNeural", name: "Denise", language: "French (France)", locale: "fr-FR", gender: "Female" },
  { id: "fr-FR-EloiseNeural", name: "Eloise", language: "French (France)", locale: "fr-FR", gender: "Female" },
  { id: "fr-FR-HenriNeural", name: "Henri", language: "French (France)", locale: "fr-FR", gender: "Male" },

  // ─── French (Canada) ───
  { id: "fr-CA-SylvieNeural", name: "Sylvie", language: "French (Canada)", locale: "fr-CA", gender: "Female" },
  { id: "fr-CA-JeanNeural", name: "Jean", language: "French (Canada)", locale: "fr-CA", gender: "Male" },
  { id: "fr-CA-AntoineNeural", name: "Antoine", language: "French (Canada)", locale: "fr-CA", gender: "Male" },

  // ─── French (Belgium) ───
  { id: "fr-BE-CharlineNeural", name: "Charline", language: "French (Belgium)", locale: "fr-BE", gender: "Female" },
  { id: "fr-BE-GerardNeural", name: "Gerard", language: "French (Belgium)", locale: "fr-BE", gender: "Male" },

  // ─── French (Switzerland) ───
  { id: "fr-CH-ArianeNeural", name: "Ariane", language: "French (Switzerland)", locale: "fr-CH", gender: "Female" },
  { id: "fr-CH-FabriceNeural", name: "Fabrice", language: "French (Switzerland)", locale: "fr-CH", gender: "Male" },

  // ─── German ───
  { id: "de-DE-KatjaNeural", name: "Katja", language: "German", locale: "de-DE", gender: "Female" },
  { id: "de-DE-AmalaNeural", name: "Amala", language: "German", locale: "de-DE", gender: "Female" },
  { id: "de-DE-ConradNeural", name: "Conrad", language: "German", locale: "de-DE", gender: "Male" },
  { id: "de-DE-KillianNeural", name: "Killian", language: "German", locale: "de-DE", gender: "Male" },

  // ─── German (Austria) ───
  { id: "de-AT-IngridNeural", name: "Ingrid", language: "German (Austria)", locale: "de-AT", gender: "Female" },
  { id: "de-AT-JonasNeural", name: "Jonas", language: "German (Austria)", locale: "de-AT", gender: "Male" },

  // ─── German (Switzerland) ───
  { id: "de-CH-LeniNeural", name: "Leni", language: "German (Switzerland)", locale: "de-CH", gender: "Female" },
  { id: "de-CH-JanNeural", name: "Jan", language: "German (Switzerland)", locale: "de-CH", gender: "Male" },

  // ─── Greek ───
  { id: "el-GR-AthinaNeural", name: "Athina", language: "Greek", locale: "el-GR", gender: "Female" },
  { id: "el-GR-NestorasNeural", name: "Nestoras", language: "Greek", locale: "el-GR", gender: "Male" },

  // ─── Gujarati ───
  { id: "gu-IN-DhwaniNeural", name: "Dhwani", language: "Gujarati", locale: "gu-IN", gender: "Female" },
  { id: "gu-IN-NiranjanNeural", name: "Niranjan", language: "Gujarati", locale: "gu-IN", gender: "Male" },

  // ─── Hebrew ───
  { id: "he-IL-HilaNeural", name: "Hila", language: "Hebrew", locale: "he-IL", gender: "Female" },
  { id: "he-IL-AvriNeural", name: "Avri", language: "Hebrew", locale: "he-IL", gender: "Male" },

  // ─── Hindi ───
  { id: "hi-IN-SwaraNeural", name: "Swara", language: "Hindi", locale: "hi-IN", gender: "Female" },
  { id: "hi-IN-MadhurNeural", name: "Madhur", language: "Hindi", locale: "hi-IN", gender: "Male" },

  // ─── Hungarian ───
  { id: "hu-HU-NoemiNeural", name: "Noemi", language: "Hungarian", locale: "hu-HU", gender: "Female" },
  { id: "hu-HU-TamasNeural", name: "Tamas", language: "Hungarian", locale: "hu-HU", gender: "Male" },

  // ─── Indonesian ───
  { id: "id-ID-GadisNeural", name: "Gadis", language: "Indonesian", locale: "id-ID", gender: "Female" },
  { id: "id-ID-ArdiNeural", name: "Ardi", language: "Indonesian", locale: "id-ID", gender: "Male" },

  // ─── Italian ───
  { id: "it-IT-ElsaNeural", name: "Elsa", language: "Italian", locale: "it-IT", gender: "Female" },
  { id: "it-IT-IsabellaNeural", name: "Isabella", language: "Italian", locale: "it-IT", gender: "Female" },
  { id: "it-IT-DiegoNeural", name: "Diego", language: "Italian", locale: "it-IT", gender: "Male" },
  { id: "it-IT-GiuseppeNeural", name: "Giuseppe", language: "Italian", locale: "it-IT", gender: "Male" },

  // ─── Japanese ───
  { id: "ja-JP-NanamiNeural", name: "Nanami", language: "Japanese", locale: "ja-JP", gender: "Female" },
  { id: "ja-JP-KeitaNeural", name: "Keita", language: "Japanese", locale: "ja-JP", gender: "Male" },

  // ─── Kannada ───
  { id: "kn-IN-SapnaNeural", name: "Sapna", language: "Kannada", locale: "kn-IN", gender: "Female" },
  { id: "kn-IN-GaganNeural", name: "Gagan", language: "Kannada", locale: "kn-IN", gender: "Male" },

  // ─── Korean ───
  { id: "ko-KR-SunHiNeural", name: "SunHi", language: "Korean", locale: "ko-KR", gender: "Female" },
  { id: "ko-KR-InJoonNeural", name: "InJoon", language: "Korean", locale: "ko-KR", gender: "Male" },

  // ─── Latvian ───
  { id: "lv-LV-EveritaNeural", name: "Everita", language: "Latvian", locale: "lv-LV", gender: "Female" },
  { id: "lv-LV-NilsNeural", name: "Nils", language: "Latvian", locale: "lv-LV", gender: "Male" },

  // ─── Lithuanian ───
  { id: "lt-LT-OnaNeural", name: "Ona", language: "Lithuanian", locale: "lt-LT", gender: "Female" },
  { id: "lt-LT-LeonasNeural", name: "Leonas", language: "Lithuanian", locale: "lt-LT", gender: "Male" },

  // ─── Malay ───
  { id: "ms-MY-YasminNeural", name: "Yasmin", language: "Malay", locale: "ms-MY", gender: "Female" },
  { id: "ms-MY-OsmanNeural", name: "Osman", language: "Malay", locale: "ms-MY", gender: "Male" },

  // ─── Malayalam ───
  { id: "ml-IN-SobhanaNeural", name: "Sobhana", language: "Malayalam", locale: "ml-IN", gender: "Female" },
  { id: "ml-IN-MidhunNeural", name: "Midhun", language: "Malayalam", locale: "ml-IN", gender: "Male" },

  // ─── Marathi ───
  { id: "mr-IN-AarohiNeural", name: "Aarohi", language: "Marathi", locale: "mr-IN", gender: "Female" },
  { id: "mr-IN-ManoharNeural", name: "Manohar", language: "Marathi", locale: "mr-IN", gender: "Male" },

  // ─── Norwegian ───
  { id: "nb-NO-PernilleNeural", name: "Pernille", language: "Norwegian", locale: "nb-NO", gender: "Female" },
  { id: "nb-NO-FinnNeural", name: "Finn", language: "Norwegian", locale: "nb-NO", gender: "Male" },

  // ─── Persian ───
  { id: "fa-IR-DilaraNeural", name: "Dilara", language: "Persian", locale: "fa-IR", gender: "Female" },
  { id: "fa-IR-FaridNeural", name: "Farid", language: "Persian", locale: "fa-IR", gender: "Male" },

  // ─── Polish ───
  { id: "pl-PL-AgnieszkaNeural", name: "Agnieszka", language: "Polish", locale: "pl-PL", gender: "Female" },
  { id: "pl-PL-ZofiaNeural", name: "Zofia", language: "Polish", locale: "pl-PL", gender: "Female" },
  { id: "pl-PL-MarekNeural", name: "Marek", language: "Polish", locale: "pl-PL", gender: "Male" },

  // ─── Portuguese (Brazil) ───
  { id: "pt-BR-FranciscaNeural", name: "Francisca", language: "Portuguese (Brazil)", locale: "pt-BR", gender: "Female" },
  { id: "pt-BR-AntonioNeural", name: "Antonio", language: "Portuguese (Brazil)", locale: "pt-BR", gender: "Male" },

  // ─── Portuguese (Portugal) ───
  { id: "pt-PT-RaquelNeural", name: "Raquel", language: "Portuguese (Portugal)", locale: "pt-PT", gender: "Female" },
  { id: "pt-PT-DuarteNeural", name: "Duarte", language: "Portuguese (Portugal)", locale: "pt-PT", gender: "Male" },

  // ─── Romanian ───
  { id: "ro-RO-AlinaNeural", name: "Alina", language: "Romanian", locale: "ro-RO", gender: "Female" },
  { id: "ro-RO-EmilNeural", name: "Emil", language: "Romanian", locale: "ro-RO", gender: "Male" },

  // ─── Russian ───
  { id: "ru-RU-SvetlanaNeural", name: "Svetlana", language: "Russian", locale: "ru-RU", gender: "Female" },
  { id: "ru-RU-DariyaNeural", name: "Dariya", language: "Russian", locale: "ru-RU", gender: "Female" },
  { id: "ru-RU-DmitryNeural", name: "Dmitry", language: "Russian", locale: "ru-RU", gender: "Male" },

  // ─── Serbian ───
  { id: "sr-RS-SophieNeural", name: "Sophie", language: "Serbian", locale: "sr-RS", gender: "Female" },
  { id: "sr-RS-NicholasNeural", name: "Nicholas", language: "Serbian", locale: "sr-RS", gender: "Male" },

  // ─── Slovak ───
  { id: "sk-SK-ViktoriaNeural", name: "Viktoria", language: "Slovak", locale: "sk-SK", gender: "Female" },
  { id: "sk-SK-LukasNeural", name: "Lukas", language: "Slovak", locale: "sk-SK", gender: "Male" },

  // ─── Slovenian ───
  { id: "sl-SI-PetraNeural", name: "Petra", language: "Slovenian", locale: "sl-SI", gender: "Female" },
  { id: "sl-SI-RokNeural", name: "Rok", language: "Slovenian", locale: "sl-SI", gender: "Male" },

  // ─── Spanish (Spain) ───
  { id: "es-ES-ElviraNeural", name: "Elvira", language: "Spanish (Spain)", locale: "es-ES", gender: "Female" },
  { id: "es-ES-AlvaroNeural", name: "Alvaro", language: "Spanish (Spain)", locale: "es-ES", gender: "Male" },

  // ─── Spanish (Mexico) ───
  { id: "es-MX-DaliaNeural", name: "Dalia", language: "Spanish (Mexico)", locale: "es-MX", gender: "Female" },
  { id: "es-MX-JorgeNeural", name: "Jorge", language: "Spanish (Mexico)", locale: "es-MX", gender: "Male" },

  // ─── Spanish (Argentina) ───
  { id: "es-AR-ElenaNeural", name: "Elena", language: "Spanish (Argentina)", locale: "es-AR", gender: "Female" },
  { id: "es-AR-TomasNeural", name: "Tomas", language: "Spanish (Argentina)", locale: "es-AR", gender: "Male" },

  // ─── Spanish (Colombia) ───
  { id: "es-CO-SalomeNeural", name: "Salome", language: "Spanish (Colombia)", locale: "es-CO", gender: "Female" },
  { id: "es-CO-GonzaloNeural", name: "Gonzalo", language: "Spanish (Colombia)", locale: "es-CO", gender: "Male" },

  // ─── Swahili ───
  { id: "sw-KE-ZuriNeural", name: "Zuri", language: "Swahili", locale: "sw-KE", gender: "Female" },
  { id: "sw-KE-RafikiNeural", name: "Rafiki", language: "Swahili", locale: "sw-KE", gender: "Male" },

  // ─── Swedish ───
  { id: "sv-SE-SofieNeural", name: "Sofie", language: "Swedish", locale: "sv-SE", gender: "Female" },
  { id: "sv-SE-MattiasNeural", name: "Mattias", language: "Swedish", locale: "sv-SE", gender: "Male" },

  // ─── Tamil ───
  { id: "ta-IN-PallaviNeural", name: "Pallavi", language: "Tamil (India)", locale: "ta-IN", gender: "Female" },
  { id: "ta-IN-ValluvarNeural", name: "Valluvar", language: "Tamil (India)", locale: "ta-IN", gender: "Male" },

  // ─── Telugu ───
  { id: "te-IN-ShrutiNeural", name: "Shruti", language: "Telugu", locale: "te-IN", gender: "Female" },
  { id: "te-IN-MohanNeural", name: "Mohan", language: "Telugu", locale: "te-IN", gender: "Male" },

  // ─── Thai ───
  { id: "th-TH-PremwadeeNeural", name: "Premwadee", language: "Thai", locale: "th-TH", gender: "Female" },
  { id: "th-TH-NiwatNeural", name: "Niwat", language: "Thai", locale: "th-TH", gender: "Male" },

  // ─── Turkish ───
  { id: "tr-TR-EmelNeural", name: "Emel", language: "Turkish", locale: "tr-TR", gender: "Female" },
  { id: "tr-TR-AhmetNeural", name: "Ahmet", language: "Turkish", locale: "tr-TR", gender: "Male" },

  // ─── Ukrainian ───
  { id: "uk-UA-PolinaNeural", name: "Polina", language: "Ukrainian", locale: "uk-UA", gender: "Female" },
  { id: "uk-UA-OstapNeural", name: "Ostap", language: "Ukrainian", locale: "uk-UA", gender: "Male" },

  // ─── Urdu ───
  { id: "ur-PK-UzmaNeural", name: "Uzma", language: "Urdu", locale: "ur-PK", gender: "Female" },
  { id: "ur-PK-AsadNeural", name: "Asad", language: "Urdu", locale: "ur-PK", gender: "Male" },

  // ─── Vietnamese ───
  { id: "vi-VN-HoaiMyNeural", name: "HoaiMy", language: "Vietnamese", locale: "vi-VN", gender: "Female" },
  { id: "vi-VN-NamMinhNeural", name: "NamMinh", language: "Vietnamese", locale: "vi-VN", gender: "Male" },

  // ─── Welsh ───
  { id: "cy-GB-NiaNeural", name: "Nia", language: "Welsh", locale: "cy-GB", gender: "Female" },
  { id: "cy-GB-AledNeural", name: "Aled", language: "Welsh", locale: "cy-GB", gender: "Male" },
];

/** Default Edge TTS voice ID */
export const DEFAULT_EDGE_TTS_VOICE = "en-US-AriaNeural";

/**
 * Get unique language labels sorted alphabetically.
 */
export function getEdgeTTSLanguages(): string[] {
  const langs = new Set(EDGE_TTS_VOICES.map((v) => v.language));
  return Array.from(langs).sort();
}

/**
 * Get voices filtered by language.
 */
export function getEdgeTTSVoicesByLanguage(language: string): EdgeTTSVoice[] {
  return EDGE_TTS_VOICES.filter((v) => v.language === language);
}

/**
 * Group all voices by language.
 * Returns a sorted map of language → voices.
 */
export function getEdgeTTSVoicesGrouped(): Map<string, EdgeTTSVoice[]> {
  const grouped = new Map<string, EdgeTTSVoice[]>();
  for (const voice of EDGE_TTS_VOICES) {
    const list = grouped.get(voice.language) ?? [];
    list.push(voice);
    grouped.set(voice.language, list);
  }
  // Sort keys
  const sorted = new Map(
    [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
  return sorted;
}

/**
 * Find a voice by its ID.
 */
export function findEdgeTTSVoice(id: string): EdgeTTSVoice | undefined {
  return EDGE_TTS_VOICES.find((v) => v.id === id);
}
