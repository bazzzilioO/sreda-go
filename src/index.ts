interface Env {
  DB: D1Database;
  ISKRA_API_BASE: string;
  SMARTLINK_API_KEY?: string;
  ISKRA_API_KEY?: string;
  GO_INDEX_BASE?: string;
  TELEGRAM_BOT_TOKEN?: string;
}

type TelegramCoverSource = { type: "telegram"; file_id: string };
type ExternalCoverSource = { type: "external"; url: string };
type CoverSource = TelegramCoverSource | ExternalCoverSource | string;
type NormalizedCoverSourceResult = { value: string | null; error: string | null };
type NormalizedLinksResult = { value: LinkRecord; error: string | null };
type FieldError = { code: string; message: string; field?: string };

const TELEGRAM_FILE_ID_PATTERN = /^[A-Za-z0-9_:-]+$/;

type ApiSmartlink = {
  id?: string;
  artist?: string;
  artist_name?: string;
  title?: string;
  release_date?: string;
  links?: Record<string, string>;
  cover_url?: string;
  cover_source?: CoverSource;
  cover_version?: number;
};

type UpsertRequest = {
  id?: string | number;
  artist_slug?: string;
  slug?: string;
  title?: string;
  artist_name?: string;
  artist?: string;
  release_date?: string;
  cover_source?: unknown;
  cover_url?: string;
  cover_version?: number;
  links?: Record<string, string>;
  owner?: {
    tg_user_id?: string | number | null;
    username?: string | number | null;
    display_name?: string | number | null;
  } | null;
};

type LinkRecord = Record<string, string>;
type OwnerRecord = {
  tg_user_id: string;
  username: string | null;
  display_name: string | null;
};

// ==================== Anti-phishing URL allowlist (server-side) ====================
const PLATFORM_ALLOWED_HOSTS: Record<string, string[]> = {
  spotify: ["open.spotify.com", "spotify.link", "spoti.fi"],
  apple: ["music.apple.com", "geo.music.apple.com", "apple.co"],
  itunes: ["itunes.apple.com", "music.apple.com", "apple.co"],
  yandex: ["music.yandex.ru"],
  vk: ["vk.com", "m.vk.com"],
  deezer: ["www.deezer.com", "deezer.com", "deezer.page.link"],
  youtube: ["www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"],
  youtubemusic: ["music.youtube.com"],
  zvuk: ["zvuk.com", "open.zvuk.com"],
  kion: ["kion.ru", "music.mts.ru"],
  bandlink: ["band.link", "bandlink.to"],
  telegram: ["t.me", "telegram.me"],
  tidal: ["tidal.com", "listen.tidal.com"],
  soundcloud: ["soundcloud.com", "m.soundcloud.com"],
  amazon: ["music.amazon.com", "amazon.com"],
  pandora: ["pandora.com", "www.pandora.com"],
  shazam: ["shazam.com", "www.shazam.com"],
};

// ==================== Platform Display Configuration ====================
const PLATFORM_LABELS: Record<string, string> = {
  spotify: "Spotify",
  apple: "Apple Music",
  itunes: "iTunes Store",
  yandex: "Яндекс Музыка",
  vk: "ВКонтакте",
  deezer: "Deezer",
  youtube: "YouTube",
  youtubemusic: "YouTube Music",
  zvuk: "Звук",
  kion: "KION",
  bandlink: "Band.link",
  telegram: "Telegram",
  tidal: "TIDAL",
  soundcloud: "SoundCloud",
  amazon: "Amazon Music",
  pandora: "Pandora",
  shazam: "Shazam",
  other: "Другое",
};

// Brand colors for hover effects
const PLATFORM_COLORS: Record<string, string> = {
  spotify: "#1DB954",
  apple: "#FA2D48",
  itunes: "#FA2D48",
  yandex: "#FFCC00",
  vk: "#0077FF",
  deezer: "#A238FF",
  youtube: "#FF0000",
  youtubemusic: "#FF0000",
  zvuk: "#6B4EFF",
  kion: "#E30611",
  bandlink: "#FF6B35",
  telegram: "#26A5E4",
  tidal: "#00FFFF",
  soundcloud: "#FF5500",
  amazon: "#FF9900",
  pandora: "#224099",
  shazam: "#0088FF",
  other: "#F59E0B",
};

// SVG icons for platforms (optimized, 20x20 viewBox)
const PLATFORM_ICONS: Record<string, string> = {
  spotify: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`,
  apple: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.994 6.124c-.064 4.96-4.08 6.573-4.08 6.573-.18 3.82 2.755 5.424 2.755 5.424-1.293 4.14-4.916 5.792-4.916 5.792-3.156-2.27-3.156-5.958-3.156-5.958 0-3.617 2.755-5.164 2.755-5.164-1.508-2.057-3.978-2.057-4.736-2.057-3.156 0-4.736 2.27-4.736 2.27s-1.58-2.27-4.736-2.27c-.758 0-3.228 0-4.736 2.057 0 0 2.755 1.547 2.755 5.164 0 0 0 3.688-3.156 5.958 0 0-3.623-1.652-4.916-5.792 0 0 2.935-1.604 2.755-5.424 0 0-4.016-1.613-4.08-6.573C-.064 1.164 4.016.018 5.524 0c1.508-.018 3.084.787 4.232 2.164 0 0 1.185-2.182 4.244-2.182 3.059 0 4.244 2.182 4.244 2.182C19.392.787 20.968-.018 22.476 0c1.508.018 5.588 1.164 5.518 6.124z"/></svg>`,
  itunes: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.977 23.999c-6.617 0-12-5.383-12-12s5.383-12 12-12 12 5.383 12 12-5.383 12-12 12zm0-22c-5.514 0-10 4.486-10 10s4.486 10 10 10 10-4.486 10-10-4.486-10-10-10zm4.251 14.666c-.349.506-.906.77-1.48.77-.347 0-.7-.098-1.013-.305l-2.476-1.623c-.262-.17-.419-.46-.419-.77V8.463c0-.505.41-.916.916-.916.505 0 .916.41.916.916v7.462l2.155 1.412c.415.272.53.826.26 1.241l-.859.088z"/></svg>`,
  yandex: `<svg viewBox="278 0 104 104" fill="currentColor"><path d="M380.997 40.197L380.715 38.1185L363.688 34.1434L372.483 21.0908L371.444 19.6758L357.728 26.387L359.243 8.13218L357.728 7.38061L349.214 22.0362L339.191 0H337.301L339.755 21.5664L314.689 1.60882L312.516 2.17837L331.811 26.387L293.504 13.6221L291.707 15.6067L325.945 34.9948L278.843 38.9699L278.367 41.8059L327.366 47.1021L286.411 80.5878L288.302 83.142L336.825 56.6552L327.272 103.1H330.202L348.932 59.4031L360.282 93.5465L362.267 92.0316L358.01 57.7943L375.319 77.3702L376.364 75.3856L363.5 51.1711L381.754 57.6064L381.942 55.6159L366.717 43.4147L380.997 40.197Z"/></svg>`,
  vk: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.408 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.862-.523-2.049-1.712-1.033-1.033-1.49-1.173-1.744-1.173-.356 0-.458.102-.458.593v1.562c0 .424-.135.678-1.253.678-1.846 0-3.896-1.12-5.339-3.202-2.17-3.042-2.763-5.321-2.763-5.79 0-.254.102-.491.593-.491h1.744c.44 0 .61.203.779.678.864 2.49 2.304 4.675 2.896 4.675.22 0 .322-.102.322-.66V9.721c-.068-1.186-.695-1.287-.695-1.71 0-.203.17-.407.44-.407h2.744c.373 0 .508.203.508.643v3.473c0 .372.17.508.271.508.22 0 .407-.136.813-.542 1.254-1.406 2.151-3.574 2.151-3.574.119-.254.322-.491.762-.491h1.744c.525 0 .644.27.525.643-.22 1.017-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .78.186.254.796.779 1.203 1.253.745.847 1.32 1.558 1.473 2.049.17.474-.085.716-.576.716z"/></svg>`,
  deezer: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.81 4.16v3.03H24V4.16zM6.27 8.38v3.027h5.189V8.38zm12.54 0v3.027H24V8.38zM6.27 12.566v3.027h5.189v-3.027zm6.271 0v3.027h5.19v-3.027zm6.27 0v3.027H24v-3.027zM0 16.752v3.027h5.19v-3.027zm6.27 0v3.027h5.189v-3.027zm6.271 0v3.027h5.19v-3.027zm6.27 0v3.027H24v-3.027z"/></svg>`,
  youtube: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  youtubemusic: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228s6.228-2.796 6.228-6.228S15.432 5.772 12 5.772zM9.684 15.54V8.46L15.816 12l-6.132 3.54z"/></svg>`,
  zvuk: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.568 16.8H6.432V7.2h11.136v9.6zm-9.936-1.2h8.736V8.4H7.632v7.2z"/></svg>`,
  kion: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`,
  bandlink: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  telegram: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`,
  tidal: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.012 3.992L8.008 7.996 4.004 3.992 0 7.996l4.004 4.004L0 16.004l4.004 4.004 4.004-4.004 4.004 4.004 4.004-4.004-4.004-4.004 4.004-4.004-4.004-4.004zm4.004 4.004l4.004-4.004L24.024 7.996l-4.004 4.004-4.004-4.004z"/></svg>`,
  soundcloud: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.052-.1-.101-.1m-.899.828c-.06 0-.091.037-.104.094L0 14.479l.165 1.308c.014.057.045.094.09.094s.089-.037.099-.094l.21-1.308-.21-1.319c-.01-.06-.052-.094-.09-.094m1.83-1.229c-.061 0-.12.045-.12.104l-.21 2.563.225 2.458c0 .06.045.104.106.104.061 0 .12-.044.12-.104l.24-2.474-.24-2.547c0-.06-.06-.104-.12-.104m.945-.089c-.075 0-.135.06-.15.135l-.193 2.64.21 2.544c.016.077.075.138.149.138.075 0 .135-.061.15-.138l.24-2.544-.24-2.625c-.015-.09-.074-.15-.165-.15m.976-.18c-.09 0-.166.075-.18.165l-.176 2.805.195 2.579c.015.09.09.166.18.166.074 0 .149-.076.164-.165l.21-2.58-.225-2.805c-.015-.09-.074-.165-.165-.165m1.065-.285c-.104 0-.18.09-.195.194l-.164 3.075.18 2.64c.015.09.09.18.194.18s.18-.09.195-.18l.195-2.64-.21-3.075c-.015-.105-.09-.194-.195-.194m1.035-.255c-.119 0-.21.09-.225.209l-.149 3.315.149 2.64c.015.119.105.21.225.21.119 0 .21-.091.224-.21l.166-2.64-.18-3.315c-.016-.12-.106-.209-.226-.209m1.095-.225c-.135 0-.24.105-.24.24l-.149 3.525.149 2.64c.015.135.105.24.255.24.135 0 .24-.105.24-.24l.165-2.64-.165-3.525c0-.135-.105-.24-.24-.24m1.064-.21c-.149 0-.27.12-.27.27l-.119 3.705.135 2.609c0 .15.12.27.27.27.134 0 .254-.12.27-.27l.149-2.609-.165-3.69c-.015-.165-.12-.285-.27-.285m1.096-.149c-.165 0-.3.135-.3.3l-.12 3.825.135 2.564c0 .165.135.3.285.3.165 0 .3-.135.315-.3l.135-2.564-.149-3.825c-.015-.165-.135-.3-.301-.3m1.11.015c-.18 0-.33.15-.33.33l-.105 3.765.12 2.534c.015.18.149.33.33.33.165 0 .315-.15.33-.33l.135-2.534-.149-3.765c-.015-.18-.15-.33-.331-.33m1.096.135c-.195 0-.345.165-.36.36l-.089 3.615.104 2.504c.016.195.166.36.361.36s.344-.165.359-.36l.12-2.504-.135-3.615c-.015-.195-.165-.36-.36-.36m1.14.24c-.21 0-.375.165-.389.375l-.075 3.36.09 2.474c.015.21.18.376.39.376.195 0 .36-.166.375-.376l.105-2.474-.12-3.36c-.015-.21-.165-.375-.375-.375m1.081.34c-.225 0-.39.18-.405.405l-.06 3.015.075 2.429c.015.225.18.405.405.405.21 0 .39-.18.405-.405l.09-2.43-.105-3.014c-.015-.225-.18-.406-.405-.406m1.155.509c-.24 0-.42.195-.435.42l-.045 2.491.06 2.399c.015.24.195.42.42.42.24 0 .42-.18.435-.42l.075-2.4-.089-2.49c-.016-.226-.196-.42-.421-.42m1.185.645c-.255 0-.45.21-.465.45l-.03 1.83.045 2.344c.015.255.21.45.45.45.255 0 .45-.195.465-.45l.06-2.344-.074-1.83c-.016-.24-.211-.45-.451-.45m4.141-.855c-.42 0-.825.075-1.2.225-.24-2.731-2.535-4.876-5.341-4.876-1.275 0-2.46.449-3.375 1.199-.195.165-.24.285-.24.435v9.75c0 .165.12.33.285.375.045 0 9.75.015 9.87.015 1.906 0 3.45-1.544 3.45-3.45 0-1.904-1.545-3.674-3.45-3.674"/></svg>`,
  amazon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M.045 18.02c.072-.116.187-.124.348-.022 3.636 2.11 7.594 3.166 11.87 3.166 2.852 0 5.668-.533 8.447-1.595l.315-.14c.138-.06.234-.1.293-.13.226-.088.39-.046.493.124.104.17.075.36-.087.572l-.062.086c-.679.938-1.58 1.71-2.71 2.325-1.127.614-2.284 1.024-3.475 1.232-.296.05-.594.093-.893.127-.3.035-.6.063-.896.085-.59.04-1.178.04-1.766 0-.295-.02-.59-.045-.886-.08-.295-.032-.59-.076-.884-.13-1.19-.21-2.347-.62-3.475-1.233-1.13-.615-2.03-1.387-2.71-2.325l-.05-.076c-.065-.12-.055-.2.027-.24.03-.015.06-.022.092-.022.05 0 .1.015.148.045zm3.11-1.47c-.103.07-.177.197-.16.34v.017c.016.136.088.234.218.293l.03.012c.082.035.14.03.175-.02.168-.24.397-.44.683-.6.286-.16.57-.24.856-.24.09 0 .178.01.263.03.287.063.516.193.686.386l.037.044c.046.06.095.08.147.057l.016-.008c.08-.037.118-.11.114-.218-.003-.1-.05-.193-.14-.278-.332-.294-.77-.483-1.31-.567-.168-.026-.338-.038-.508-.038-.475 0-.92.106-1.332.32-.41.213-.733.457-.967.73l-.077.1c-.037.056-.047.105-.03.147.017.042.058.075.122.094.035.01.073.012.11.005.04-.006.085-.027.137-.065l.074-.053c.233-.17.488-.313.764-.434.276-.12.547-.18.815-.18.03 0 .063 0 .096.003.115.01.195.074.24.194.044.12.033.248-.036.38-.068.135-.18.24-.332.32-.152.078-.31.117-.475.117-.06 0-.118-.006-.175-.02-.143-.037-.254-.112-.335-.228-.08-.117-.102-.25-.067-.4.035-.15.125-.277.27-.378.145-.1.304-.15.477-.15.03 0 .06 0 .09.005.14.022.244.09.31.202l.02.038c.025.058.02.098-.02.12l-.015.007c-.04.017-.085.007-.137-.028-.088-.06-.194-.083-.316-.07-.122.013-.23.067-.32.16-.092.095-.14.21-.144.345-.003.135.04.253.132.352.092.1.21.16.356.18.06.01.12.012.18.01.15-.01.286-.066.407-.167.122-.1.2-.225.234-.375.035-.15.012-.29-.068-.418-.08-.127-.198-.216-.354-.265-.065-.02-.133-.03-.204-.03-.13 0-.254.03-.37.09-.115.06-.21.14-.286.24-.1.133-.162.284-.188.453-.025.17.002.33.082.48.08.15.196.266.35.35.154.082.32.124.5.124.06 0 .118-.005.177-.015.175-.03.33-.102.468-.218.137-.115.232-.26.286-.433.053-.173.05-.35-.01-.527-.062-.177-.167-.32-.318-.43-.15-.107-.322-.16-.515-.16-.07 0-.138.006-.205.02-.175.033-.33.106-.465.217-.136.112-.235.25-.297.418-.062.167-.07.34-.024.52.046.177.14.323.28.438.14.114.3.175.48.18.06.003.12 0 .18-.01.14-.02.27-.073.387-.16.118-.085.208-.195.27-.328.105-.223.103-.456-.003-.7-.108-.243-.29-.42-.548-.528-.118-.05-.24-.074-.367-.074-.03 0-.058 0-.088.003-.16.012-.305.06-.436.148-.13.087-.23.2-.297.34-.067.138-.093.287-.08.447.014.16.07.306.168.438.1.132.224.23.378.294.154.064.315.09.485.077.17-.013.326-.065.47-.157.145-.092.26-.214.345-.365.085-.152.126-.32.12-.507-.004-.186-.057-.36-.158-.52-.1-.16-.237-.283-.41-.37-.172-.086-.36-.12-.562-.1-.202.02-.386.09-.552.21-.166.12-.292.278-.378.47-.086.195-.116.402-.09.623.027.22.11.42.248.596.138.177.314.31.528.4.214.09.44.118.677.085.238-.033.452-.12.643-.263.192-.143.338-.327.44-.553.1-.225.14-.47.115-.73-.024-.263-.107-.5-.248-.717-.14-.215-.326-.382-.557-.5-.23-.12-.48-.165-.752-.138-.27.027-.515.117-.735.27-.22.153-.39.354-.512.605-.12.25-.175.52-.162.81.013.288.09.555.23.8.14.247.33.44.57.584.24.143.505.213.795.21.29-.003.56-.08.81-.23.25-.15.445-.353.585-.61.14-.255.21-.536.21-.84 0-.305-.07-.587-.21-.847-.14-.26-.336-.465-.587-.617-.25-.15-.522-.225-.815-.225-.12 0-.238.013-.356.038-.24.053-.456.153-.65.3-.193.147-.34.332-.44.556-.1.223-.142.467-.13.73.014.264.088.505.222.724.135.22.315.394.54.523.225.13.47.194.736.194.03 0 .057 0 .085-.002.297-.015.566-.097.807-.245.24-.148.43-.348.567-.6.137-.25.206-.528.206-.83 0-.304-.07-.584-.21-.84-.14-.256-.335-.458-.586-.608-.252-.15-.527-.225-.825-.225-.12 0-.238.012-.354.037-.24.052-.456.15-.648.298-.192.147-.34.333-.44.557-.1.224-.143.467-.13.73.013.263.087.504.22.723.135.22.315.394.54.523.225.13.47.194.737.194.03 0 .058 0 .086-.002.15-.01.292-.04.427-.094l-.132.048z"/></svg>`,
  pandora: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm3.75 14.25c-.69 1.035-1.74 1.5-3.015 1.5H9.75v3h-3V5.25h6c2.865 0 4.5 1.98 4.5 4.5 0 1.785-.795 3.405-1.5 4.5z"/></svg>`,
  shazam: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm3.627 14.715c-.478.904-1.61 1.252-2.513.774-1.746-.923-3.097-2.385-3.892-4.196-.398-.907.015-1.968.923-2.366.908-.397 1.968.016 2.366.924.398.908.015 1.968-.923 2.366-.153.067-.312.108-.473.125.397.676.93 1.27 1.565 1.74.22.164.354.42.354.697 0 .348-.203.662-.52.81-.097.046-.2.07-.305.07-.167 0-.332-.053-.47-.153-1.015-.754-1.793-1.784-2.253-2.976-.398-.906.016-1.968.924-2.365.907-.398 1.967.015 2.365.923.478.905.127 2.036-.774 2.514-.154.082-.32.136-.49.16.322.463.728.867 1.196 1.194.904.478 1.252 1.61.773 2.514-.067.128-.152.246-.252.353l-.1.092z"/></svg>`,
  other: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
};

function normalizeHostname(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const host = (u.hostname || "").trim().toLowerCase();
    return host.endsWith(".") ? host.slice(0, -1) : host;
  } catch {
    return "";
  }
}

function isAllowedPlatformUrl(platform: string, rawUrl: string): boolean {
  const p = (platform || "").trim().toLowerCase();
  const allowed = PLATFORM_ALLOWED_HOSTS[p];
  if (!allowed) return false;
  const trimmed = (rawUrl || "").trim();
  if (!trimmed) return false;
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return false;
  }
  const proto = (u.protocol || "").toLowerCase();
  if (proto !== "http:" && proto !== "https:") return false;
  const host = normalizeHostname(trimmed);
  if (!host) return false;
  for (const canon of allowed) {
    const c = canon.toLowerCase();
    if (host === c || host.endsWith("." + c)) return true;
  }
  return false;
}

function enforceLinksAllowlist(
  links: LinkRecord,
  context: string,
): { value: LinkRecord; rejected: LinkRecord; error: string | null } {
  const value: LinkRecord = {};
  const rejected: LinkRecord = {};
  for (const [k, v] of Object.entries(links || {})) {
    const platform = String(k || "").trim().toLowerCase();
    const url = String(v || "").trim();
    if (!platform || !url) continue;
    // Only enforce for known platforms; unknown keys are dropped to avoid storing arbitrary phishing vectors.
    if (!Object.prototype.hasOwnProperty.call(PLATFORM_ALLOWED_HOSTS, platform)) {
      continue;
    }
    if (isAllowedPlatformUrl(platform, url)) {
      value[platform] = url;
    } else {
      rejected[platform] = url;
      console.warn(`${context}: rejected non-canonical host`, platform, url);
    }
  }
  const hasRejected = Object.keys(rejected).length > 0;
  return { value, rejected, error: hasRejected ? "links_invalid_domain" : null };
}

function normalizeCoverVersionInput(input: unknown): number | null {
  if (typeof input !== "number" || !Number.isFinite(input)) return null;

  const normalized = Math.trunc(input);

  return normalized >= 0 ? normalized : 0;
}

function normalizeCoverSourceInput(input: unknown, context: string): NormalizedCoverSourceResult {
  if (input === undefined || input === null) {
    return { value: null, error: null };
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    return { value: trimmed || null, error: null };
  }

  if (typeof input === "object") {
    const candidate = input as { type?: unknown; file_id?: unknown; url?: unknown };
    if (candidate.type === "telegram") {
      if (typeof candidate.file_id === "string") {
        const trimmedFileId = candidate.file_id.trim();
        if (validateTelegramFileId(trimmedFileId)) {
          return {
            value: JSON.stringify({ type: "telegram", file_id: trimmedFileId }),
            error: null,
          };
        }

        console.warn(`${context}: invalid telegram file_id`, candidate.file_id);
        return { value: null, error: "invalid_cover_source_file_id" };
      }

      console.warn(`${context}: missing telegram file_id`, input);
      return { value: null, error: "missing_cover_source_file_id" };
    }

    if (candidate.type === "external") {
      const url = candidate.url;
      if (typeof url === "string" && url.trim()) {
        return {
          value: JSON.stringify({ type: "external", url: url.trim() }),
          error: null,
        };
      }

      console.warn(`${context}: missing external url`, input);
      return { value: null, error: "missing_cover_source_url" };
    }

    console.warn(`${context}: unsupported cover_source object`, input);
    return { value: null, error: "invalid_cover_source_type" };
  }

  console.warn(`${context}: unsupported cover_source type`, input);
  return { value: null, error: "invalid_cover_source_type" };
}

function parseCoverSource(raw: string | null, context: string): CoverSource | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as { type?: unknown }).type === "telegram" &&
      typeof (parsed as { file_id?: unknown }).file_id === "string" &&
      (parsed as { file_id: string }).file_id.trim()
    ) {
      return { type: "telegram", file_id: (parsed as { file_id: string }).file_id.trim() };
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as { type?: unknown }).type === "external" &&
      typeof (parsed as { url?: unknown }).url === "string" &&
      (parsed as { url: string }).url.trim()
    ) {
      return { type: "external", url: (parsed as { url: string }).url.trim() };
    }
  } catch (error) {
    console.warn(`${context}: cover_source parse error`, error, raw);
  }

  return raw;
}

function isTelegramCoverSource(source: CoverSource | null): source is TelegramCoverSource {
  return (
    Boolean(source) &&
    typeof source === "object" &&
    (source as { type?: unknown }).type === "telegram" &&
    typeof (source as { file_id?: unknown }).file_id === "string"
  );
}

function isExternalCoverSource(source: CoverSource | null): source is ExternalCoverSource {
  return (
    Boolean(source) &&
    typeof source === "object" &&
    (source as { type?: unknown }).type === "external" &&
    typeof (source as { url?: unknown }).url === "string"
  );
}

function validateTelegramFileId(fileId: string): boolean {
  return Boolean(fileId) && fileId.length <= 256 && TELEGRAM_FILE_ID_PATTERN.test(fileId);
}

function resolveCoverUrl(coverUrl?: string | null): string | null {
  if (!coverUrl) return null;

  const trimmed = coverUrl.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed, "https://placeholder.local");
    url.searchParams.delete("v");

    if (/^https?:\/\//i.test(trimmed)) {
      return url.toString();
    }

    const search = url.searchParams.toString();
    const query = search ? `?${search}` : "";
    return `${url.pathname || "/"}${query}${url.hash}`;
  } catch (error) {
    console.warn("[cover] resolveCoverUrl failed to normalize, falling back", error);
    const withoutVersion = trimmed.replace(/([?&])v=\d+(&|$)/, (match, prefix, suffix) => {
      if (prefix === "?" && suffix) return "?";
      if (prefix === "?" && !suffix) return "";
      if (prefix === "&" && suffix) return suffix;
      return "";
    });

    return withoutVersion
      .replace(/&&+/g, "&")
      .replace(/\?&/, "?")
      .replace(/[?&]$/, "");
  }
}

function buildCoverUrlWithVersion(
  coverUrl: string | null,
  coverVersion: number | null | undefined,
): string | null {
  if (!coverUrl) return null;

  const version = coverVersion ?? 0;

  try {
    const url = new URL(coverUrl, "https://placeholder.local");
    url.searchParams.delete("v");
    url.searchParams.set("v", String(version));

    if (/^https?:\/\//i.test(coverUrl)) {
      return url.toString();
    }

    const search = url.searchParams.toString();
    const query = search ? `?${search}` : "";
    return `${url.pathname || "/"}${query}${url.hash}`;
  } catch (error) {
    console.warn("[cover] failed to attach version, falling back", error);
    const separator = coverUrl.includes("?") ? "&" : "?";
    return `${coverUrl}${separator}v=${version}`;
  }
}

function resolvePreferredCoverUrl({
  coverUrl,
  coverSource,
  artistSlug,
  slug,
  goIndexBase,
  context,
}: {
  coverUrl?: string | null;
  coverSource?: CoverSource | string | null;
  artistSlug: string;
  slug: string;
  goIndexBase: string;
  context: string;
}): string | null {
  const canonicalBase = goIndexBase.replace(/\/$/, "");
  const parsedCoverSource =
    typeof coverSource === "string" ? parseCoverSource(coverSource, context) : coverSource ?? null;

  if (isTelegramCoverSource(parsedCoverSource)) {
    return `${canonicalBase}/api/cover/${encodeURIComponent(artistSlug)}/${encodeURIComponent(slug)}`;
  }

  if (isExternalCoverSource(parsedCoverSource)) {
    return resolveCoverUrl(parsedCoverSource.url) ?? null;
  }

  return resolveCoverUrl(coverUrl ?? null);
}

function extractTelegramFileId(
  coverUrl: string | undefined,
  coverSource: CoverSource | null,
  context: string,
): string | null {
  const fromUrl = extractTelegramFileIdFromString(coverUrl, context);
  if (fromUrl) return fromUrl;

  if (typeof coverSource === "string") {
    const fromSourceString = extractTelegramFileIdFromString(
      coverSource,
      `${context}:cover_source_string`,
    );
    if (fromSourceString) return fromSourceString;
  }

  if (isTelegramCoverSource(coverSource)) {
    const fileId = coverSource.file_id.trim();
    if (validateTelegramFileId(fileId)) return fileId;
    console.warn(`${context}: invalid telegram cover_source file_id`, coverSource.file_id);
  }

  return null;
}

function extractTelegramFileIdFromString(value: string | undefined, context: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();

  if (!trimmed.toLowerCase().startsWith("tg:")) {
    return null;
  }

  const fileId = trimmed.slice(3).trim();
  if (validateTelegramFileId(fileId)) return fileId;

  console.warn(`${context}: invalid telegram file_id in string value`);
  return null;
}

function buildCoverCacheKey(request: Request, coverVersion: number | null | undefined): Request {
  const url = new URL(request.url);
  const normalizedVersion = normalizeCoverVersionInput(coverVersion ?? null);

  if (normalizedVersion !== null) {
    url.searchParams.set("v", String(normalizedVersion));
  }

  return new Request(url.toString(), request);
}

function isInternalCoverUrl(targetUrl: string, requestUrl: string): boolean {
  try {
    const resolvedTarget = new URL(targetUrl, requestUrl);
    const requestOrigin = new URL(requestUrl).origin;

    return resolvedTarget.origin === requestOrigin && resolvedTarget.pathname.startsWith("/api/cover");
  } catch (error) {
    console.warn("[cover] failed to inspect cover_url", targetUrl, error);
    return false;
  }
}

async function handleCoverProxy(
  request: Request,
  env: Env,
  artistSlug: string,
  slug: string,
): Promise<Response> {
  try {
    const query = await env.DB.prepare(
      `SELECT
        cover_source,
        cover_url,
        cover_version
      FROM smartlinks
      WHERE artist_slug=?1 AND slug=?2
      LIMIT 1`,
    )
      .bind(artistSlug, slug)
      .all<{ cover_source: string | null; cover_url: string | null; cover_version: number | null }>();

    const record = query.results?.[0];
    if (!record) {
      return new Response("Not found", { status: 404 });
    }

    const cacheKey = buildCoverCacheKey(request, record.cover_version);
    const cached = await caches.default.match(cacheKey);
    if (cached) {
      return cached;
    }

    return resolveCoverResponse(request, env, record, cacheKey, `[cover ${artistSlug}/${slug}]`);
  } catch (error) {
    console.error("[cover] db error", error);
    return new Response("Failed to load cover", { status: 500 });
  }
}

async function handleTelegramCover(request: Request, env: Env, fileId: string): Promise<Response> {
  const normalizedFileId = fileId.trim();

  if (!validateTelegramFileId(normalizedFileId)) {
    console.warn("[telegram cover] invalid file_id", fileId);
    return new Response("Invalid file_id", { status: 400 });
  }

  const cacheKeyUrl = new URL(`/cover/telegram/${encodeURIComponent(normalizedFileId)}`, request.url);
  const cacheKey = new Request(cacheKeyUrl.toString(), request);

  const cached = await caches.default.match(cacheKey);
  if (cached) {
    return cached;
  }

  return handleTelegramFileRequest(request, env, normalizedFileId, cacheKey);
}

async function handleTelegramFileRequest(
  request: Request,
  env: Env,
  fileId: string,
  cacheKey?: Request,
): Promise<Response> {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.warn("[telegram cover] missing TELEGRAM_BOT_TOKEN env");
    return jsonResponse({ error: "telegram_token_missing" }, 502);
  }

  try {
    const fileInfoResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
    );

    if (!fileInfoResponse.ok) {
      console.warn("[telegram cover] getFile request failed", fileInfoResponse.status);
      return respondWithPlaceholderCover(cacheKey);
    }

    const fileInfo = (await fileInfoResponse.json()) as {
      ok?: boolean;
      result?: { file_path?: string };
      description?: string;
    };

    const filePath = fileInfo?.result?.file_path;
    if (!fileInfo?.ok || !filePath) {
      console.warn("[telegram cover] getFile response invalid", fileInfo);
      return respondWithPlaceholderCover(cacheKey);
    }

    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    const fileResponse = await fetch(fileUrl);

    if (!fileResponse.ok || !fileResponse.body) {
      console.warn("[telegram cover] file fetch failed", fileResponse.status);
      if (fileResponse.status === 404) {
        return respondWithPlaceholderCover(cacheKey);
      }

      return jsonResponse(
        {
          error: "telegram_file_fetch_failed",
          status: fileResponse.status,
        },
        fileResponse.status === 404 ? 404 : 502,
      );
    }

    const fallbackEtag = `W/"tg-${fileId}-${filePath}"`;
    return finalizeImageResponse(fileResponse, cacheKey, fallbackEtag);
  } catch (error) {
    console.error("[telegram cover] fetch error", error);
    return respondWithPlaceholderCover(cacheKey);
  }
}

async function respondWithPlaceholderCover(cacheKey?: Request): Promise<Response> {
  const headers = new Headers({
    "Content-Type": "image/svg+xml",
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: 'W/"cover-placeholder-v1"',
  });

  const placeholder = new Response(COVER_PLACEHOLDER_SVG, {
    status: 200,
    headers,
  });

  if (cacheKey) {
    await caches.default.put(cacheKey, placeholder.clone());
  }

  return placeholder;
}

async function finalizeImageResponse(
  fileResponse: Response,
  cacheKey?: Request,
  fallbackEtag?: string,
): Promise<Response> {
  const headers = new Headers();
  const contentType = fileResponse.headers.get("content-type") ?? "image/jpeg";
  headers.set("Content-Type", contentType);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  const contentLength = fileResponse.headers.get("content-length");
  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  const etag = fileResponse.headers.get("etag") ?? fallbackEtag;
  if (etag) {
    headers.set("ETag", etag);
  }

  headers.delete("set-cookie");

  const proxied = new Response(fileResponse.body, {
    status: 200,
    headers,
  });

  if (cacheKey) {
    await caches.default.put(cacheKey, proxied.clone());
  }

  return proxied;
}

async function handleCoverById(request: Request, env: Env, canonicalId: string): Promise<Response> {
  try {
    const query = await env.DB.prepare(
      `SELECT cover_url, cover_source, cover_version FROM smartlinks WHERE id=?1 LIMIT 1`,
    )
      .bind(canonicalId)
      .all<{ cover_url: string | null; cover_source: string | null; cover_version: number | null }>();

    const record = query.results?.[0];
    if (!record) {
      return jsonResponse({ error: "not_found" }, 404);
    }

    const cacheKey = buildCoverCacheKey(request, record.cover_version);
    const cached = await caches.default.match(cacheKey);
    if (cached) {
      return cached;
    }

    return resolveCoverResponse(request, env, record, cacheKey, `[api/cover ${canonicalId}]`);
  } catch (error) {
    console.error("[api/cover] db error", error);
    return jsonResponse({ error: "server_error" }, 500);
  }
}

async function handleCoverBySlug(
  request: Request,
  env: Env,
  artistSlug: string,
  slug: string,
): Promise<Response> {
  try {
    const query = await env.DB.prepare(
      `SELECT cover_source, cover_url, cover_version FROM smartlinks WHERE artist_slug=?1 AND slug=?2 LIMIT 1`,
    )
      .bind(artistSlug, slug)
      .all<{ cover_source: string | null; cover_url: string | null; cover_version: number | null }>();

    const record = query.results?.[0];
    if (!record) {
      return new Response("Not found", { status: 404 });
    }

    const cacheKey = buildCoverCacheKey(request, record.cover_version);
    const cached = await caches.default.match(cacheKey);
    if (cached) {
      return cached;
    }

    return resolveCoverResponse(request, env, record, cacheKey, `[api/cover ${artistSlug}/${slug}]`);
  } catch (error) {
    console.error("[api/cover] db error", error);
    return new Response("Failed to load cover", { status: 500 });
  }
}

async function resolveCoverResponse(
  request: Request,
  env: Env,
  record: { cover_source: string | null; cover_url: string | null },
  cacheKey: Request,
  context: string,
): Promise<Response> {
  const coverSource = parseCoverSource(record.cover_source, `${context} cover_source`);
  const coverUrl = record.cover_url?.trim() || null;

  if (!coverSource) {
    return respondWithPlaceholderCover(cacheKey);
  }

  if (isTelegramCoverSource(coverSource)) {
    const fileId = coverSource.file_id.trim();
    if (!validateTelegramFileId(fileId)) {
      console.warn(`${context}: invalid telegram file_id`, coverSource.file_id);
      return new Response("Invalid cover", { status: 404 });
    }

    return handleTelegramFileRequest(request, env, fileId, cacheKey);
  }

  const externalUrl =
    (isExternalCoverSource(coverSource) && coverSource.url) ||
    (coverUrl && !isInternalCoverUrl(coverUrl, request.url) ? coverUrl : null);

  if (externalUrl && !isInternalCoverUrl(externalUrl, request.url)) {
    return handleExternalCover(request, externalUrl, cacheKey, context);
  }

  return respondWithPlaceholderCover(cacheKey);
}

async function handleExternalCover(
  request: Request,
  targetUrl: string,
  cacheKey: Request,
  context: string,
): Promise<Response> {
  try {
    const resolvedUrl = new URL(targetUrl, request.url).toString();
    const fileResponse = await fetch(resolvedUrl);

    if (!fileResponse.ok || !fileResponse.body) {
      console.warn(`[cover external] fetch failed ${context}`, resolvedUrl, fileResponse.status);
      return new Response("Failed to load cover", { status: fileResponse.status === 404 ? 404 : 502 });
    }

    const fallbackEtag = `W/"external-${resolvedUrl}"`;
    return finalizeImageResponse(fileResponse, cacheKey, fallbackEtag);
  } catch (error) {
    console.warn(`[cover external] invalid url ${context}`, targetUrl, error);
    return new Response("Invalid cover url", { status: 400 });
  }
}

const RU_TO_LATIN_MAP: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "c",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function transliterate(value?: string | null): string {
  if (!value) return "";

  return value
    .split("")
    .map((char) => {
      const lower = char.toLowerCase();
      const mapped = RU_TO_LATIN_MAP[lower];
      return mapped !== undefined ? mapped : char;
    })
    .join("");
}

function slugify(value?: string | null): string {
  if (!value) return "";
  const transliterated = transliterate(value);
  return transliterated
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildSlug(
  value: string | undefined | null,
  { allowFallback = false, fallbackValue }: { allowFallback?: boolean; fallbackValue?: string } = {},
): string | undefined {
  const slug = slugify(value);
  if (slug) return slug;
  if (allowFallback && fallbackValue) {
    return fallbackValue;
  }
  return undefined;
}

function deriveSlugsFromPayload(payload: UpsertRequest): {
  artistSlug?: string;
  releaseSlug?: string;
  errors: FieldError[];
} {
  const errors: FieldError[] = [];
  const artistSource = payload.artist_slug ?? payload.artist_name ?? payload.artist;
  const manualSlugProvided =
    payload.slug !== undefined && payload.slug !== null && String(payload.slug).trim();
  const releaseSource = manualSlugProvided ? payload.slug : payload.title;
  const releaseSlug = buildSlug(releaseSource, { allowFallback: false });
  const artistSlug = buildSlug(artistSource, { allowFallback: false });

  if (!artistSlug) {
    errors.push({
      code: "artist_slug_required",
      message: "Укажите artist_slug или artist_name.",
      field: "artist_slug",
    });
  }

  if (!releaseSlug) {
    errors.push({
      code: "slug_required",
      message: manualSlugProvided
        ? "Поле slug пустое или содержит недопустимые символы."
        : "Укажите title или slug для генерации slug.",
      field: manualSlugProvided ? "slug" : "title",
    });
  }

  return { artistSlug, releaseSlug, errors };
}

function normalizeLinksInput(
  input: unknown,
  context: string,
  { strict = false }: { strict?: boolean } = {},
): NormalizedLinksResult {
  const normalized: LinkRecord = {};

  if (input === undefined || input === null) {
    return { value: normalized, error: null };
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return { value: normalized, error: null };

    try {
      return normalizeLinksInput(JSON.parse(trimmed), context, { strict });
    } catch (error) {
      console.warn(`${context}: links string is not JSON`, trimmed);
      if (strict) {
        return { value: normalized, error: "links_invalid_json" };
      }
      normalized.other = trimmed;
      return { value: normalized, error: null };
    }
  }

  if (Array.isArray(input)) {
    let hasValid = false;
    for (const entry of input) {
      if (entry && typeof entry === "object") {
        const platform =
          (entry as { platform?: string; name?: string }).platform ??
          (entry as { name?: string }).name;
        const url = (entry as { url?: string; link?: string }).url ?? (entry as { link?: string }).link;

        if (platform && url && typeof platform === "string" && typeof url === "string") {
          normalized[platform] = url;
          hasValid = true;
          continue;
        }
      }

      if (Array.isArray(entry) && entry.length >= 2) {
        const [platform, url] = entry as unknown[];
        if (typeof platform === "string" && typeof url === "string") {
          normalized[platform] = url;
          hasValid = true;
          continue;
        }
      }

      console.warn(`${context}: skipping unrecognized link entry`, entry);
    }

    if (strict && !hasValid && input.length > 0) {
      return { value: normalized, error: "links_empty" };
    }

    return { value: normalized, error: null };
  }

  if (typeof input === "object") {
    let hasValid = false;
    for (const [platform, value] of Object.entries(input as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim()) {
        normalized[platform] = value.trim();
        hasValid = true;
      } else if (value !== undefined && value !== null) {
        console.warn(`${context}: non-string link value dropped`, platform, value);
      }
    }

    if (strict && !hasValid && Object.keys(input as Record<string, unknown>).length > 0) {
      return { value: normalized, error: "links_empty" };
    }

    return { value: normalized, error: null };
  }

  console.warn(`${context}: unsupported links payload`, input);
  return { value: normalized, error: strict ? "links_invalid_type" : null };
}

function parseLinksFromJson(linksJson: string | null, context: string): LinkRecord {
  if (!linksJson) {
    console.warn(`${context}: links_json missing or null`);
    return {};
  }

  try {
    const parsed = JSON.parse(linksJson);
    const normalized = normalizeLinksInput(parsed, `${context}:parse`).value;

    if (!Object.keys(normalized).length) {
      console.warn(`${context}: parsed links empty`, linksJson);
    }

    return normalized;
  } catch (error) {
    console.warn(`${context}: links_json parse error`, error, linksJson);
    return {};
  }
}

async function syncSmartlinkToWeb(
  payload: UpsertRequest,
  env: Env,
): Promise<[boolean, number | null, string | null]> {
  const apiKey = env.SMARTLINK_API_KEY;
  if (!apiKey) return [false, null, "missing_api_key"];

  const goIndexBase = env.GO_INDEX_BASE?.replace(/\/$/, "");
  if (!goIndexBase) {
    return [false, null, "missing_go_index_base"];
  }

  const { artistSlug, releaseSlug: slug, errors } = deriveSlugsFromPayload(payload);

  if (errors.length || !payload.id || !artistSlug || !slug || !payload.title) {
    console.warn("smartlink sync skipped", {
      id: payload.id,
      artistSlug,
      slug,
      title: payload.title,
      errors,
    });
    return [false, null, "invalid_payload"];
  }

  const body = {
    id: payload.id,
    artist_slug: artistSlug,
    slug,
    title: payload.title,
    artist_name: payload.artist_name,
    release_date: payload.release_date,
    cover_source: payload.cover_source,
    cover_url: payload.cover_url,
    cover_version: payload.cover_version,
    links: payload.links,
  };

  try {
    const response = await fetch(`${goIndexBase}/api/index/upsert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        "X-Skip-Sync": "1",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn("smartlink sync failed", response.status, errorText);
      return [false, response.status, errorText || null];
    }
    return [true, response.status, null];
  } catch (error) {
    console.warn("smartlink sync error", error);
    return [false, null, error instanceof Error ? error.message : String(error)];
  }
}

const CACHE_HEADERS = { "Cache-Control": "public, max-age=60" } as const;
const COVER_PLACEHOLDER_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="1200" viewBox="0 0 1200 1200" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="1200" rx="140" fill="#1E1E1E" />
  <rect x="120" y="120" width="960" height="960" rx="100" fill="#262626" stroke="#262626" stroke-width="8" />
  <rect x="220" y="220" width="760" height="760" rx="80" fill="#1E1E1E" stroke="#262626" stroke-width="6" />
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="'Inter', 'Segoe UI', system-ui" font-size="96" font-weight="700" fill="#FFFFFF">SREDA</text>
  <text x="50%" y="58%" text-anchor="middle" dominant-baseline="middle" font-family="'Inter', 'Segoe UI', system-ui" font-size="32" font-weight="500" fill="#D9D9D9">cover unavailable</text>
</svg>`;
const COVER_PLACEHOLDER_DATA_URL = `data:image/svg+xml,${encodeURIComponent(COVER_PLACEHOLDER_SVG)}`;
const LINK_ORDER = [
  "telegram",
  "spotify",
  "apple",
  "yandex",
  "vk",
  "youtube",
  "bandlink",
  "other",
];

async function ensureSchema(db: D1Database): Promise<void> {
  const alterStatements = [
    "ALTER TABLE smartlinks ADD COLUMN cover_file_id TEXT",
    "ALTER TABLE smartlinks ADD COLUMN owner_tg_user_id TEXT",
    "ALTER TABLE smartlinks ADD COLUMN owner_tg_username TEXT",
    "ALTER TABLE smartlinks ADD COLUMN owner_display_name TEXT",
    "ALTER TABLE smartlinks ADD COLUMN caption_text TEXT",
    "ALTER TABLE smartlinks ADD COLUMN flags TEXT",
    "ALTER TABLE smartlinks ADD COLUMN artist_photo_url TEXT",
  ];

  for (const statement of alterStatements) {
    try {
      await db.prepare(statement).run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/duplicate column name/i.test(message)) {
        continue;
      }

      console.warn(`[schema] failed to apply migration: ${statement}`, error);
      throw error;
    }
  }

  try {
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_smartlinks_owner ON smartlinks(owner_tg_user_id)").run();
  } catch (error) {
    console.warn("[schema] failed to ensure idx_smartlinks_owner", error);
    throw error;
  }
}

function normalizeOwnerInput(input: unknown): { owner: OwnerRecord | null; error: FieldError | null } {
  if (input === undefined || input === null) {
    return { owner: null, error: null };
  }

  if (typeof input !== "object") {
    return {
      owner: null,
      error: {
        code: "owner_must_be_object",
        message: "Поле owner должно быть объектом.",
        field: "owner",
      },
    };
  }

  const candidate = input as { tg_user_id?: unknown; username?: unknown; display_name?: unknown };
  const tgUserIdRaw = candidate.tg_user_id;

  if (tgUserIdRaw === undefined || tgUserIdRaw === null) {
    return {
      owner: null,
      error: {
        code: "owner_tg_user_id_required",
        message: "Укажите owner.tg_user_id.",
        field: "owner.tg_user_id",
      },
    };
  }

  const tgUserId = String(tgUserIdRaw).trim();
  if (!tgUserId) {
    return {
      owner: null,
      error: {
        code: "owner_tg_user_id_empty",
        message: "Поле owner.tg_user_id не может быть пустым.",
        field: "owner.tg_user_id",
      },
    };
  }

  const usernameRaw = candidate.username;
  const displayNameRaw = candidate.display_name;

  const username =
    usernameRaw === undefined || usernameRaw === null ? null : String(usernameRaw).trim() || null;
  const displayName =
    displayNameRaw === undefined || displayNameRaw === null
      ? null
      : String(displayNameRaw).trim() || null;

  return {
    owner: {
      tg_user_id: tgUserId,
      username,
      display_name: displayName,
    },
    error: null,
  };
}

function normalizeTextInput(input: unknown, context: string): { value: string | null; error: string | null } {
  if (input === undefined || input === null) {
    return { value: null, error: null };
  }

  if (typeof input === "string") {
    return { value: input.trim() || null, error: null };
  }

  if (typeof input === "number" || typeof input === "boolean") {
    return { value: String(input), error: null };
  }

  console.warn(`${context}: expected text input`, input);
  return { value: null, error: "invalid_text" };
}

function normalizeFlagsInput(input: unknown, context: string): { value: string | null; error: string | null } {
  if (input === undefined || input === null) {
    return { value: null, error: null };
  }

  if (typeof input === "string") {
    return { value: input.trim() || null, error: null };
  }

  try {
    return { value: JSON.stringify(input), error: null };
  } catch (error) {
    console.warn(`${context}: flags JSON stringify failed`, error);
    return { value: null, error: "invalid_flags" };
  }
}

function buildOwnerResponse(record: {
  owner_tg_user_id?: string | null;
  owner_tg_username?: string | null;
  owner_display_name?: string | null;
}): OwnerRecord | null {
  if (!record.owner_tg_user_id) {
    return null;
  }

  return {
    tg_user_id: String(record.owner_tg_user_id),
    username: record.owner_tg_username ? String(record.owner_tg_username) : null,
    display_name: record.owner_display_name ? String(record.owner_display_name) : null,
  };
}

function requireEnvValue(
  value: string | undefined,
  envName: string,
  message: string,
): Response | null {
  if (!value) {
    return jsonResponse(
      {
        ok: false,
        error: "missing_env",
        details: {
          env: envName,
          message,
        },
      },
      503,
    );
  }
  return null;
}

function requireIndexAuth(request: Request, env: Env): Response | null {
  const token = env.SMARTLINK_API_KEY;
  const envError = requireEnvValue(
    token,
    "SMARTLINK_API_KEY",
    "Настройте SMARTLINK_API_KEY, чтобы использовать защищенные API эндпоинты.",
  );
  if (envError) {
    return envError;
  }

  const header = request.headers.get("Authorization") || request.headers.get("authorization");
  if (!header) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : header.trim();
  if (!provided || provided !== token) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  return null;
}

function getOwnerTgId(url: URL): string | null {
  const rawOwnerId =
    url.searchParams.get("tg_id") ??
    url.searchParams.get("owner_tg_user_id") ??
    url.searchParams.get("owner_tg_id") ??
    url.searchParams.get("tg_user_id");
  const ownerTgId = rawOwnerId?.trim();
  return ownerTgId ? ownerTgId : null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=UTF-8" },
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

const THEME = {
  colors: {
    background: "#000000",
    gradient:
      "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.06), transparent 32%), radial-gradient(circle at 80% 0%, rgba(255,255,255,0.04), transparent 36%), linear-gradient(145deg, #0d0d0f 0%, #111112 40%, #0b0b0b 100%)",
    surface: "rgba(38,38,38,0.62)",
    surfaceStrong: "rgba(30,30,30,0.8)",
    surfaceMuted: "rgba(28,28,28,0.65)",
    accent: "#F59E0B",
    textPrimary: "#FFFFFF",
    textSecondary: "rgba(255,255,255,0.7)",
    textMuted: "rgba(255,255,255,0.38)",
    textFaint: "rgba(255,255,255,0.2)",
    border: "rgba(255,255,255,0.1)",
    borderSubtle: "rgba(255,255,255,0.08)",
  },
  fonts: {
    body: '"Inter", "SF Pro Display", "Manrope", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  radii: {
    card: "26px",
    cover: "18px",
    pill: "999px",
    glass: "20px",
  },
  shadows: {
    card: "0 18px 48px rgba(0,0,0,0.4)",
    cover: "0 12px 26px rgba(0,0,0,0.45)",
    button: "0 8px 20px rgba(0,0,0,0.3)",
    gridCard: "0 10px 28px rgba(0,0,0,0.28)",
  },
};

function prettifySlug(value: string): string {
  const normalized = value.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return value;

  return normalized
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDisplayDate(value?: string | null): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}.${month}.${year}`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const day = String(parsed.getDate()).padStart(2, "0");
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const year = parsed.getFullYear();
    return `${day}.${month}.${year}`;
  }

  return trimmed;
}

function buildDisplayCoverUrl({
  coverUrl,
  coverSource,
  artistSlug,
  slug,
  goIndexBase,
  coverVersion,
  context = "[cover_display]",
}: {
  coverUrl?: string | null;
  coverSource?: CoverSource | string | null;
  artistSlug: string;
  slug: string;
  goIndexBase: string;
  coverVersion?: number | null;
  context?: string;
}): string {
  const resolvedCoverUrl = resolvePreferredCoverUrl({
    coverUrl,
    coverSource,
    artistSlug,
    slug,
    goIndexBase,
    context,
  });

  const withVersion = buildCoverUrlWithVersion(resolvedCoverUrl, coverVersion ?? null);

  return withVersion ?? COVER_PLACEHOLDER_DATA_URL;
}

function renderMedia({
  src,
  alt,
  className,
  fallbackLabel = "NO COVER",
}: {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}): string {
  const classes = ["media", className?.trim() || ""].filter(Boolean).join(" ");
  const imageMarkup = src
    ? `<img class="media__img is-loading" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" />`
    : "";

  const fallbackAttribute = src ? "" : 'data-has-src="false"';

  return `
    <div class="${classes}" ${fallbackAttribute}>
      <div class="media__skeleton" aria-hidden="true"></div>
      <div class="media__fallback" role="img" aria-label="${escapeHtml(fallbackLabel)}">${escapeHtml(fallbackLabel)}</div>
      ${imageMarkup}
    </div>
  `;
}

function htmlPage(
  body: string,
  {
    title = "SREDA go",
    backgroundImage,
    pageClass,
  }: { title?: string; backgroundImage?: string | null; pageClass?: string | null } = {},
): string {
  const backgroundStyle = backgroundImage
    ? "--page-bg-image: none; --page-bg-opacity: 0.32;"
    : "--page-bg-image: none; --page-bg-opacity: 0;";
  const backgroundAttribute = backgroundImage ? `data-bg-image="${escapeHtml(backgroundImage)}"` : "";
  const poweredLogo = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 1500" role="img" aria-label="SREDA logo">
      <polygon fill="currentColor" points="504.67 149.25 802.96 560.18 654.86 750 805.04 900.19 204.29 1350.75 354.48 900.19 204.29 750 504.67 149.25"/>
      <g fill="currentColor">
        <path d="M622.08,1248.19h-54.74c-1.89-9.12-13.84-17.93-27.06-17.93s-21.71,3.78-21.71,11.96c0,24.54,105.39-.32,105.39,58.52,0,28.94-30.2,50.02-79.28,50.02-39.95,0-76.13-19.51-86.51-51.6v-9.75h54.74c3.46,11.33,16.99,18.88,30.2,18.88,15.42,0,23.91-5.66,23.91-12.27,0-19.19-104.13,1.57-104.13-58.2,0-28.31,31.46-51.91,76.76-51.91s72.99,22.97,82.43,52.54v9.75Z"/>
        <path d="M653.54,1189.67h52.85v16.36c11.64-12.58,28-20.13,46.88-20.13v54.74c-4.09-.94-11.01-1.57-16.04-1.57-14.16,0-27.37,7.55-30.83,21.39v86.51h-52.85v-157.3Z"/>
        <path d="M942.96,1287.83v10.07c-9.75,29.89-42.79,52.85-85.57,52.85-50.02,0-86.83-32.09-86.83-82.43s36.81-82.43,86.83-82.43c47.19,0,81.17,28.31,85.57,69.84v19.51h-118.6c2.52,17.3,15.1,27.68,33.03,27.68,12.9,0,24.22-4.72,30.2-15.1h55.37ZM827.51,1247.24h59.77c-5.35-11.01-15.1-17.3-29.89-17.3-13.84,0-24.54,6.29-29.89,17.3Z"/>
        <path d="M1135.49,1346.97h-52.85v-14.79c-12.27,11.96-28.31,18.56-46.88,18.56-40.58,0-70.16-32.09-70.16-82.43s29.57-82.43,70.16-82.43c18.56,0,34.61,6.92,46.88,18.88v-78.02h52.85v220.22ZM1019.09,1268.32c0,20.45,12.9,32.72,32.72,32.72s32.72-12.27,32.72-32.72-12.9-32.72-32.72-32.72-32.72,12.27-32.72,32.72Z"/>
        <path d="M1336.83,1346.97h-52.85v-14.79c-12.27,11.96-28.31,18.56-46.88,18.56-40.58,0-70.16-32.09-70.16-82.43s29.57-82.43,70.16-82.43c18.56,0,34.61,6.92,46.88,18.88v-15.1h52.85v157.3ZM1285.86,1268.32c0-20.45-12.9-32.72-32.72-32.72s-32.72,12.27-32.72,32.72,12.9,32.72,32.72,32.72,32.72-12.27,32.72-32.72Z"/>
      </g>
    </svg>
  `;
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700&display=swap" rel="stylesheet">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html { height: 100%; }
    body {
      margin: 0;
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      position: relative;
      overflow-x: hidden;
      overflow-y: auto;
      color: ${THEME.colors.textPrimary};
      font-family: ${THEME.fonts.body};
      padding: 2rem 1.25rem 2.75rem;
      background: ${THEME.colors.background};
      isolation: isolate;
    }
    body::before,
    body::after {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: -2;
    }
    body::before {
      background: ${THEME.colors.gradient};
      opacity: 0.92;
    }
    body::after {
      background-image: var(--page-bg-image);
      background-size: cover;
      background-position: center;
      filter: blur(32px) saturate(1.08);
      opacity: 0;
      transform: scale(1.04);
      transition: opacity 260ms ease;
    }
    body.bg-ready::after { opacity: var(--page-bg-opacity, 0); }
    .noise-layer {
      position: fixed;
      inset: 0;
      pointer-events: none;
      background-image: 
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E"),
        url("data:image/svg+xml,%3Csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg' viewBox='200 140 600 1200'%3E%3Cpolygon points='504.67 149.25 802.96 560.18 654.86 750 805.04 900.19 204.29 1350.75 354.48 900.19 204.29 750 504.67 149.25' fill='rgba(255,255,255,0.018)' stroke='rgba(255,255,255,0.035)' stroke-width='1.5'/%3E%3C/svg%3E");
      background-size: 160px 160px, 120px 120px;
      background-position: 0 0, 0 0;
      z-index: -1;
      opacity: 0.5;
      mix-blend-mode: soft-light;
    }
    .card {
      width: min(960px, calc(100% - 24px));
      background: ${THEME.colors.surface};
      border: 1px solid ${THEME.colors.borderSubtle};
      border-radius: ${THEME.radii.glass};
      box-shadow: ${THEME.shadows.card};
      padding: 1.5rem;
      position: relative;
      overflow: hidden;
      backdrop-filter: blur(20px) saturate(1.1);
      -webkit-backdrop-filter: blur(20px) saturate(1.1);
      border-top: 1px solid rgba(255,255,255,0.06);
      isolation: isolate;
    }
    .card::before {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(255,255,255,0.04), transparent 22%);
      pointer-events: none;
      z-index: 0;
    }
    .card::after {
      content: "";
      position: absolute;
      inset: 0;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E");
      pointer-events: none;
      mix-blend-mode: soft-light;
      z-index: 0;
    }
    .card > * { position: relative; z-index: 1; }

    /* ==================== Home page ==================== */
    body.page-home { align-items: center; padding-top: 3.6rem; padding-bottom: 3.6rem; }
    body.page-home .card { width: min(980px, calc(100% - 24px)); padding: 2.05rem; }
    body.page-artist .card { 
      width: min(640px, calc(100% - 32px));
      position: relative;
      background: rgba(18,18,22,0.55);
      border: 1px solid transparent;
      border-radius: 24px;
      background-clip: padding-box;
      backdrop-filter: blur(50px) saturate(1.3); -webkit-backdrop-filter: blur(50px) saturate(1.3);
      box-shadow: 0 25px 60px -15px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.06);
      overflow: hidden;
      padding: 0;
    }
    body.page-artist .card::before {
      content: ''; 
      position: absolute; 
      inset: -1px;
      border-radius: inherit; 
      padding: 1px;
      background: linear-gradient(160deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.06) 100%);
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor; 
      mask-composite: exclude;
      pointer-events: none; 
      z-index: 1;
    }
    .artist-content {
      padding: 0 1.5rem 1.5rem 1.5rem;
      position: relative;
      z-index: 2;
    }
    
    /* Artists list page */
    body.page-artists .card {
      width: min(1200px, calc(100% - 32px));
      position: relative;
      background: rgba(18,18,22,0.55);
      border: 1px solid transparent;
      border-radius: 24px;
      background-clip: padding-box;
      backdrop-filter: blur(50px) saturate(1.3); -webkit-backdrop-filter: blur(50px) saturate(1.3);
      box-shadow: 0 25px 60px -15px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.06);
      overflow: hidden;
      padding: 1rem;
    }
    body.page-artists .card::before {
      content: ''; 
      position: absolute; 
      inset: -1px;
      border-radius: inherit; 
      padding: 1px;
      background: linear-gradient(160deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.06) 100%);
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      pointer-events: none; 
      z-index: 1;
    }
    .artists-header {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: flex-end;
      gap: 0.4rem;
      margin-bottom: 0.75rem;
    }
    .artists-header__info {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .artists-header__title {
      font-family: 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif;
      font-size: 1.6rem;
      font-weight: 700;
      color: #fff;
      margin: 0;
      padding: 0;
      letter-spacing: -0.02em;
      line-height: 1.2;
    }
    .artists-header__subtitle {
      font-size: 0.8rem;
      color: rgba(255,255,255,0.5);
      line-height: 1.3;
      margin: 0;
      padding: 0;
    }
    .artists-header__count {
      font-size: 0.8rem;
      color: rgba(255,255,255,0.45);
      white-space: nowrap;
      line-height: 1.3;
    }
    .artists-search {
      position: relative;
      margin-bottom: 0.35rem;
    }
    .artists-search__input {
      width: 100%;
      padding: 0.55rem 0.8rem 0.55rem 2.2rem;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      background: rgba(255,255,255,0.04);
      backdrop-filter: blur(20px) saturate(1.2);
      -webkit-backdrop-filter: blur(20px) saturate(1.2);
      color: #fff;
      font-size: 0.88rem;
      font-family: inherit;
      outline: none;
      transition: all 200ms ease;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.05);
    }
    .artists-search__input::placeholder { color: rgba(255,255,255,0.35); }
    .artists-search__input:hover {
      border-color: rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.06);
      backdrop-filter: blur(25px) saturate(1.3);
      -webkit-backdrop-filter: blur(25px) saturate(1.3);
      box-shadow: 0 4px 12px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.08);
    }
    .artists-search__input:focus {
      border-color: rgba(255,255,255,0.15);
      background: rgba(255,255,255,0.08);
      backdrop-filter: blur(30px) saturate(1.4);
      -webkit-backdrop-filter: blur(30px) saturate(1.4);
      box-shadow: 0 6px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1);
    }
    .artists-search__input:focus-visible {
      outline: none;
    }
    .artists-search--active .artists-search__icon {
      color: rgba(245,158,11,0.6);
    }
    .artists-search__icon {
      position: absolute;
      left: 0.85rem;
      top: 50%;
      transform: translateY(-50%);
      width: 16px;
      height: 16px;
      color: rgba(255,255,255,0.4);
      pointer-events: none;
    }
    .artists-search__clear {
      position: absolute;
      right: 0.5rem;
      top: 50%;
      transform: translateY(-50%);
      width: 28px;
      height: 28px;
      border: none;
      background: rgba(255,255,255,0.08);
      border-radius: 8px;
      color: rgba(255,255,255,0.5);
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      transition: all 150ms ease;
    }
    .artists-search__clear:hover { background: rgba(255,255,255,0.12); color: #fff; }
    .artists-search__clear.visible { display: flex; }
    .artists-empty {
      text-align: center;
      padding: 3rem 1rem;
      color: rgba(255,255,255,0.5);
      font-size: 0.95rem;
      line-height: 1.6;
    }
    .artists-empty::before {
      content: '🎵';
      display: block;
      font-size: 3rem;
      margin-bottom: 1rem;
      opacity: 0.6;
    }
    .artists-loading {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.8rem;
      margin-bottom: 0.75rem;
    }
    .artists-loading-item {
      width: 100%;
      display: flex;
      flex-direction: column;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.08);
      overflow: hidden;
      background: rgba(255,255,255,0.04);
    }
    .artists-loading-item__image {
      width: 70%;
      margin: 0 auto;
      aspect-ratio: 1 / 1;
      background: linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.05) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
    }
    .artists-loading-item__text {
      padding: 0.5rem 0.6rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .artists-loading-item__text-line {
      height: 0.9rem;
      background: linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.05) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 4px;
    }
    .artists-loading-item__text-line:first-child {
      width: 80%;
    }
    .artists-loading-item__text-line:last-child {
      width: 50%;
    }
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    .artists-controls {
      display: flex;
      align-items: stretch;
      gap: 0.6rem;
      margin-bottom: 0.75rem;
      max-width: 100%;
    }
    .artists-controls {
      display: flex;
      align-items: stretch;
      gap: 0.6rem;
      margin-bottom: 0.75rem;
      max-width: 100%;
      justify-content: center;
    }
    .artists-controls .artists-search {
      flex: 1;
      margin-bottom: 0;
      display: flex;
      align-items: stretch;
      max-width: calc(70% - 0.3rem);
    }
    .artists-controls .artists-search__input {
      align-self: stretch;
    }
    .artists-sort-buttons {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
      flex-shrink: 0;
    }
    .artists-sort-btn {
      padding: 0.55rem 0.75rem;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      background: rgba(255,255,255,0.04);
      backdrop-filter: blur(20px) saturate(1.2);
      -webkit-backdrop-filter: blur(20px) saturate(1.2);
      color: rgba(255,255,255,0.7);
      font-size: 0.8rem;
      font-family: inherit;
      cursor: pointer;
      outline: none;
      transition: all 200ms ease;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.05);
    }
    .artists-sort-btn:hover {
      border-color: rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.06);
      backdrop-filter: blur(25px) saturate(1.3);
      -webkit-backdrop-filter: blur(25px) saturate(1.3);
      color: rgba(255,255,255,0.9);
      box-shadow: 0 4px 12px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.08);
    }
    .artists-sort-btn.active {
      border-color: rgba(255,255,255,0.15);
      background: rgba(255,255,255,0.08);
      backdrop-filter: blur(30px) saturate(1.4);
      -webkit-backdrop-filter: blur(30px) saturate(1.4);
      color: #fff;
      box-shadow: 0 6px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1);
    }
    .artists-sort-btn:focus-visible {
      outline: 2px solid rgba(245,158,11,0.4);
      outline-offset: 2px;
    }
    .artists-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.8rem;
      transition: opacity 300ms ease;
      margin-bottom: 0.75rem;
    }
    .artists-grid .smartlink-item {
      width: 100%;
      max-width: 100%;
      animation: fadeIn 250ms ease forwards;
      transition: all 200ms ease;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .artists-grid .smartlink-item:hover {
      transform: translateY(-3px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      border-color: rgba(255,255,255,0.12);
    }
    .artists-grid .smartlink-item:focus-visible {
      outline: 2px solid rgba(245,158,11,0.5);
      outline-offset: 2px;
      transform: translateY(-2px);
    }
    .artists-grid .smartlink-item:active {
      transform: translateY(-1px);
      transition: transform 100ms ease;
    }
    .artists-grid .smartlink-cover-wrapper {
      position: relative;
      width: 70%;
      margin: 0 auto;
    }
    .artists-grid .smartlink-cover {
      aspect-ratio: 1 / 1;
      transition: transform 200ms ease;
    }
    .artists-grid .smartlink-item:hover .smartlink-cover {
      transform: scale(1.02);
    }
    .artists-card-release-count {
      position: absolute;
      bottom: 0.5rem;
      right: 0.5rem;
      padding: 0.25rem 0.5rem;
      background: rgba(0,0,0,0.6);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border-radius: 8px;
      color: rgba(255,255,255,0.9);
      font-size: 0.7rem;
      font-weight: 600;
      white-space: nowrap;
      z-index: 2;
    }
    .artists-grid .smartlink-content {
      padding: 0.5rem 0.6rem;
    }
    .artists-card-title {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.3;
      min-height: 2.6em;
    }
    .artists-grid .smartlink-title {
      margin: 0;
      padding: 0;
    }
    .artists-grid .meta-row {
      margin: 0;
      padding: 0;
    }
    .artists-grid .smartlink-item__copy {
      position: absolute;
      right: 0.5rem;
      top: 0.5rem;
      z-index: 3;
      padding: 0.35rem;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: rgba(0,0,0,0.55);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: none;
    }
    .artists-grid .smartlink-item__copy:hover {
      background: rgba(0,0,0,0.7);
    }
    .artists-grid .smartlink-item__copy .copy-btn__icon {
      width: 16px;
      height: 16px;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .artists-pagination {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 1rem;
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid rgba(255,255,255,0.08);
    }
    .artists-pagination__btn {
      padding: 0.4rem 0.85rem;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      background: rgba(255,255,255,0.04);
      color: #fff;
      font-size: 0.8rem;
      text-decoration: none;
      transition: all 200ms ease;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .artists-pagination__btn:hover:not(.disabled) { 
      background: rgba(255,255,255,0.06); 
      border-color: rgba(255,255,255,0.12); 
      box-shadow: 0 2px 12px rgba(0,0,0,0.1);
      transform: translateY(-1px);
    }
    .artists-pagination__btn.disabled { 
      opacity: 0.35; 
      cursor: not-allowed; 
      pointer-events: none;
      background: rgba(255,255,255,0.02);
    }
    .artists-pagination__btn:focus-visible {
      outline: 2px solid rgba(245,158,11,0.5);
      outline-offset: 2px;
    }
    .artists-sort-select:focus-visible {
      outline: 2px solid rgba(245,158,11,0.5);
      outline-offset: 2px;
    }
    .artists-pagination__info {
      font-size: 0.8rem;
      color: rgba(255,255,255,0.5);
    }
    
    body.page-smartlink .card { 
      width: min(360px, calc(100% - 32px)); padding: 0; overflow: hidden;
      background: rgba(18,18,22,0.55);
      border: 1px solid transparent;
      background-clip: padding-box;
      backdrop-filter: blur(50px) saturate(1.3); -webkit-backdrop-filter: blur(50px) saturate(1.3);
      box-shadow: 0 25px 60px -15px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.06);
      position: relative;
    }
    body.page-smartlink .card::before {
      content: ''; position: absolute; inset: -1px; border-radius: inherit; padding: 1px;
      background: linear-gradient(160deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.06) 100%);
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor; mask-composite: exclude;
      pointer-events: none; z-index: 1;
    }
    .home { display: flex; flex-direction: column; gap: 1.45rem; position: relative; }
    .home::before {
      content: "";
      position: absolute;
      inset: -80px -80px auto auto;
      width: 520px;
      height: 520px;
      background: radial-gradient(circle at 35% 35%, rgba(245,158,11,0.28), transparent 60%),
                  radial-gradient(circle at 55% 55%, rgba(255,255,255,0.08), transparent 58%);
      filter: blur(18px);
      opacity: 0.9;
      pointer-events: none;
      z-index: 0;
    }
    .home > * { position: relative; z-index: 1; }
    .home-hero { display: grid; grid-template-columns: minmax(0, 1fr) 250px; gap: 1.25rem; align-items: start; }
    .home-top { display: flex; flex-direction: column; gap: 0.85rem; max-width: 720px; text-align: left; }
    .home-visual {
      width: 250px;
      height: 250px;
      border-radius: 24px;
      border: 1px solid ${THEME.colors.borderSubtle};
      background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015));
      box-shadow: 0 18px 46px rgba(0,0,0,0.38);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.55rem;
      overflow: hidden;
      position: relative;
    }
    .home-visual::before {
      content: "";
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 40% 30%, rgba(245,158,11,0.26), transparent 55%),
                  radial-gradient(circle at 70% 65%, rgba(255,255,255,0.06), transparent 60%);
      opacity: 0.95;
      pointer-events: none;
    }
    .home-visual svg { position: relative; z-index: 1; display: block; }
    .home-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      width: fit-content;
      padding: 0.25rem 0.75rem;
      border-radius: ${THEME.radii.pill};
      border: 1px solid ${THEME.colors.borderSubtle};
      background: rgba(255,255,255,0.04);
      color: ${THEME.colors.textSecondary};
      font-weight: 760;
      letter-spacing: 0.02em;
      font-size: 0.92rem;
    }
    .home-badge::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: ${THEME.colors.accent}; box-shadow: 0 0 0 4px rgba(245,158,11,0.09); }
    .home-title { font-size: 2.55rem; line-height: 1.1; letter-spacing: 0.012em; margin: 0; }
    .home-lead { font-size: 1.08rem; color: ${THEME.colors.textSecondary}; max-width: 58ch; }
    .home-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 0.25rem; }
    .home-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.55rem;
      min-height: 46px;
      padding: 0.75rem 1.05rem;
      border-radius: 14px;
      border: 1px solid ${THEME.colors.borderSubtle};
      font-weight: 820;
      letter-spacing: 0.01em;
      transition: transform 120ms ease, box-shadow 160ms ease, border-color 140ms ease, background 140ms ease;
      white-space: nowrap;
    }
    .home-action:focus-visible { outline: 2px solid rgba(245,158,11,0.5); outline-offset: 3px; }
    .home-action--primary { background: linear-gradient(125deg, rgba(245,158,11,0.95), rgba(251,191,36,0.92)); color: #0b0b0b; box-shadow: 0 10px 22px rgba(0,0,0,0.28), 0 0 0 1px rgba(245,158,11,0.18); }
    .home-action--secondary { background: rgba(255,255,255,0.035); color: ${THEME.colors.textPrimary}; border-color: rgba(255,255,255,0.10); }
    .home-action:hover { transform: translateY(-1px); border-color: rgba(245,158,11,0.45); box-shadow: 0 14px 30px rgba(0,0,0,0.34); }
    .home-action:active { transform: translateY(0); box-shadow: 0 10px 22px rgba(0,0,0,0.28); }
    .home-inline { color: ${THEME.colors.textPrimary}; border-bottom: 1px solid transparent; transition: color 120ms ease, border-color 120ms ease; }
    .home-inline:hover { color: ${THEME.colors.accent}; border-bottom-color: ${THEME.colors.accent}; }
    .home-features { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.9rem; margin-top: 0.25rem; }
    .home-feature {
      display: grid;
      grid-template-columns: 40px 1fr;
      gap: 0.85rem;
      padding: 1.05rem 1.1rem;
      border-radius: 16px;
      border: 1px solid ${THEME.colors.borderSubtle};
      background: linear-gradient(180deg, rgba(30,30,30,0.62), rgba(24,24,24,0.54));
      box-shadow: ${THEME.shadows.gridCard};
      transition: transform 130ms ease, border-color 140ms ease, box-shadow 160ms ease;
    }
    .home-feature:hover { transform: translateY(-2px); border-color: rgba(245,158,11,0.34); box-shadow: 0 18px 44px rgba(0,0,0,0.42); }
    .home-feature-icon {
      width: 40px;
      height: 40px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(255,255,255,0.04);
      display: grid;
      place-items: center;
      color: ${THEME.colors.textPrimary};
      font-weight: 900;
      letter-spacing: 0.02em;
      box-shadow: 0 10px 18px rgba(0,0,0,0.22);
      position: relative;
      overflow: hidden;
    }
    .home-feature-icon::before {
      content: "";
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 35% 30%, rgba(245,158,11,0.28), transparent 60%);
      opacity: 0.9;
    }
    .home-feature-icon > span { position: relative; z-index: 1; }
    .home-feature-title { font-weight: 850; letter-spacing: 0.01em; margin-bottom: 0.3rem; color: ${THEME.colors.textPrimary}; }
    .home-feature-text { color: ${THEME.colors.textSecondary}; line-height: 1.55; }
    .home-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.6rem; color: ${THEME.colors.textMuted}; font-size: 0.92rem; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 1rem; margin-top: 0.3rem; }
    
    /* Smartlink Release Page - Integrated Cover Design */
    .smartlink-release { display: flex; flex-direction: column; align-items: stretch; gap: 0; width: 100%; }
    .smartlink-release__cover { width: 100%; position: relative; line-height: 0; }
    .smartlink-release__cover .cover { 
      width: 100%; max-width: 100%; aspect-ratio: 1/1; border-radius: 0; 
      box-shadow: none; display: block;
    }
    .smartlink-release__cover .cover,
    .smartlink-release__cover .media {
      -webkit-mask-image: linear-gradient(to bottom, black 0%, black 65%, transparent 100%);
      mask-image: linear-gradient(to bottom, black 0%, black 65%, transparent 100%);
    }
    .smartlink-release__body { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 0 1.5rem 0.75rem; margin-top: -2rem; position: relative; z-index: 1; }
    .smartlink-release__info { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; text-align: center; width: 100%; }
    .smartlink-release__title { font-family: 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif; font-size: 1.5rem; font-weight: 700; margin: 0; color: #fff; line-height: 1.15; letter-spacing: -0.02em; }
    .smartlink-release__artist { font-family: 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif; font-size: 0.88rem; font-weight: 500; }
    .smartlink-release__artist .artist-link { 
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.35rem 0.75rem;
      border-radius: 20px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      color: rgba(255,255,255,0.7);
      font-weight: 500;
      text-decoration: none;
      transition: all 150ms ease;
    }
    .smartlink-release__artist .artist-link:hover { 
      background: rgba(255,255,255,0.1);
      border-color: rgba(255,255,255,0.2);
      color: #fff;
    }
    .smartlink-release__date { font-size: 0.78rem; color: rgba(255,255,255,0.4); margin-top: 0.15rem; }
    @keyframes fadeInUp { 
      from { opacity: 0; transform: translateY(8px); } 
      to { opacity: 1; transform: translateY(0); } 
    }
    .smartlink-release__links { display: flex; flex-direction: column; gap: 0.6rem; width: 100%; margin-top: 0.5rem; }
    .smartlink-release__links .link-btn { 
      display: flex; align-items: center; justify-content: flex-start; gap: 0.9rem;
      padding: 0.9rem 1.1rem; font-size: 0.92rem; border-radius: 16px; font-weight: 600; 
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      box-shadow: 0 2px 12px rgba(0,0,0,0.1), 0 0 1px rgba(255,255,255,0.15);
      color: #fff; 
      transition: all 180ms ease;
      text-decoration: none;
      animation: fadeInUp 0.4s ease backwards;
    }
    .smartlink-release__links .link-btn:nth-child(1) { animation-delay: 0.05s; }
    .smartlink-release__links .link-btn:nth-child(2) { animation-delay: 0.1s; }
    .smartlink-release__links .link-btn:nth-child(3) { animation-delay: 0.15s; }
    .smartlink-release__links .link-btn:nth-child(4) { animation-delay: 0.2s; }
    .smartlink-release__links .link-btn:nth-child(5) { animation-delay: 0.25s; }
    .smartlink-release__links .link-btn:nth-child(6) { animation-delay: 0.3s; }
    .smartlink-release__links .link-btn:hover { 
      background: rgba(255,255,255,0.1);
      border-color: rgba(255,255,255,0.2);
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(0,0,0,0.15), 0 0 2px rgba(255,255,255,0.2);
    }
    .smartlink-release__links .link-btn:active { transform: translateY(0); box-shadow: none; }
    .smartlink-release__links .link-btn::after { display: none; }
    .link-btn__icon { 
      width: 24px; height: 24px; flex-shrink: 0; 
      display: flex; align-items: center; justify-content: center;
      color: rgba(255,255,255,0.85);
    }
    .link-btn__icon svg { width: 100%; height: 100%; }
    .link-btn__label { flex: 1; text-align: left; font-weight: 600; }
    .smartlink-release__empty { color: rgba(255,255,255,0.4); text-align: center; padding: 1rem; }
    .smartlink-release__share { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; width: 100%; margin-top: 0.4rem; padding-top: 0.4rem; border-top: 1px solid rgba(255,255,255,0.06); }
    .smartlink-release__share .share-btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
      padding: 0.5rem 1rem; border-radius: 20px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      color: rgba(255,255,255,0.5);
      font-size: 0.85rem; font-weight: 500;
      cursor: pointer;
      transition: all 150ms ease;
    }
    .smartlink-release__share .share-btn svg { width: 14px; height: 14px; }
    .smartlink-release__share .share-btn:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.8); border-color: rgba(255,255,255,0.15); }
    .smartlink-release__share .share-btn.copied { background: rgba(34,197,94,0.15); border-color: #4ade80; color: #4ade80; }
    .smartlink-release .copy-toast { 
      text-align: center; font-size: 0.75rem; color: rgba(255,255,255,0.5); 
      height: 0; overflow: hidden;
      opacity: 0; transition: opacity 200ms ease, height 200ms ease;
    }
    .smartlink-release .copy-toast.visible { opacity: 1; height: 1.1em; }
    
    /* Legacy styles for backward compatibility */
    .release-grid { display: grid; grid-template-columns: minmax(300px, 360px) minmax(420px, 520px); gap: 1.35rem; align-items: start; justify-content: center; min-width: 0; }
    .cover-wrap { display: flex; justify-content: center; align-items: flex-start; width: 100%; align-self: stretch; min-width: 0; }
    .content-wrap { display: flex; flex-direction: column; gap: 0.75rem; width: min(520px, 100%); max-width: 520px; min-width: 0; }
    .cover {
      width: min(100%, 380px);
      max-width: 420px;
      max-height: 420px;
      aspect-ratio: 1 / 1;
      height: auto;
      border-radius: ${THEME.radii.cover};
      border: 1px solid ${THEME.colors.borderSubtle};
      background: ${THEME.colors.surfaceStrong};
      box-shadow: ${THEME.shadows.cover};
      display: block;
      overflow: hidden;
      position: relative;
    }
    .media {
      position: relative;
      display: block;
      width: 100%;
      height: 100%;
      border-radius: inherit;
      overflow: hidden;
      background: ${THEME.colors.surfaceMuted};
      isolation: isolate;
    }
    .media__img,
    .media__skeleton,
    .media__fallback {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border-radius: inherit;
    }
    .media__img {
      object-fit: cover;
      width: 100%;
      height: 100%;
      opacity: 0;
      filter: blur(10px);
      transition: opacity 260ms ease, filter 320ms ease;
      background: transparent;
    }
    .media__skeleton {
      background: linear-gradient(90deg, rgba(255,255,255,0.05), rgba(255,255,255,0.1), rgba(255,255,255,0.05));
      background-size: 200% 100%;
      animation: shimmer 1.4s ease-in-out infinite;
    }
    .media__fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      background: ${THEME.colors.surfaceStrong};
      color: ${THEME.colors.textMuted};
      font-weight: 760;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0;
      visibility: hidden;
      transition: opacity 180ms ease;
    }
    .media--ready .media__img { opacity: 1; filter: blur(0); }
    .media--ready .media__skeleton { opacity: 0; visibility: hidden; }
    .media--error .media__fallback { opacity: 1; visibility: visible; }
    .media--error .media__skeleton { opacity: 0; visibility: hidden; }
    .media[data-has-src="false"] .media__skeleton { opacity: 0; visibility: hidden; }
    .media[data-has-src="false"] .media__fallback { opacity: 1; visibility: visible; }
    .release-grid .media__fallback { font-size: 0.98rem; }
    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    .reduce-motion .media__skeleton { animation: none; background-position: center; }
    a { color: inherit; text-decoration: none; }
    h1 { margin: 0; font-size: 2rem; letter-spacing: 0.01em; color: ${THEME.colors.textPrimary}; font-weight: 820; }
    p { margin: 0; color: ${THEME.colors.textSecondary}; line-height: 1.5; }
    .meta { color: ${THEME.colors.textSecondary}; font-size: 0.98rem; display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; min-width: 0; }
    .meta strong { color: ${THEME.colors.textPrimary}; }
    .meta-label { color: ${THEME.colors.textSecondary}; }
    .meta-divider { color: ${THEME.colors.textMuted}; }
    .header { display: flex; flex-direction: column; gap: 0.55rem; min-width: 0; width: 100%; }
    .artist-line { display: inline-flex; align-items: center; gap: 0.5rem; font-size: 1rem; justify-content: flex-start; }
    .artist-line .meta-label { color: ${THEME.colors.textMuted}; }
    .release-date { color: ${THEME.colors.textMuted}; font-size: 0.9rem; margin: 0; text-align: left; opacity: 0.78; }
    .artist-link { color: ${THEME.colors.textPrimary}; text-decoration: none; border-bottom: 1px solid transparent; transition: color 120ms ease, border-color 120ms ease; }
    .artist-link:hover { color: ${THEME.colors.accent}; border-bottom-color: ${THEME.colors.accent}; }
    .links-grid { margin-top: 0.5rem; display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; }
    .links-grid.links-grid--single { grid-template-columns: 1fr; }
    .links-grid .link-btn:last-child:nth-child(odd) { grid-column: 1 / -1; }
    .link-btn {
      display: inline-flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.55rem;
      padding: 0.7rem 0.9rem;
      min-height: 44px;
      width: 100%;
      border-radius: 12px;
      border: 1px solid ${THEME.colors.borderSubtle};
      background: ${THEME.colors.surfaceMuted};
      color: ${THEME.colors.textPrimary};
      font-weight: 760;
      letter-spacing: 0.01em;
      box-shadow: 0 8px 20px rgba(0,0,0,0.26);
      transition: border-color 140ms ease, background 140ms ease, color 140ms ease, transform 120ms ease, box-shadow 150ms ease;
    }
    .link-btn::after { content: ""; width: 7px; height: 7px; border-radius: 50%; background: ${THEME.colors.accent}; opacity: 0.9; box-shadow: 0 0 0 3px rgba(245,158,11,0.09); }
    .link-btn:hover { border-color: ${THEME.colors.accent}; background: rgba(46,46,46,0.8); color: ${THEME.colors.textPrimary}; transform: translateY(-1px); box-shadow: 0 12px 28px rgba(0,0,0,0.34); }
    .link-btn:active { transform: translateY(0); border-color: ${THEME.colors.accent}; }
    .small { margin-top: 2rem; font-size: 0.95rem; color: ${THEME.colors.textMuted}; }
    .canonical-row { display: flex; flex-direction: column; align-items: stretch; gap: 0.35rem; color: ${THEME.colors.textSecondary}; font-size: 0.95rem; padding: 0; border-radius: 0; border: none; background: transparent; width: 100%; min-width: 0; margin-top: 1rem; }
    .copy-btn { border: none; background: linear-gradient(125deg, rgba(245,158,11,0.95), rgba(251,191,36,0.92)); color: #0b0b0b; border-radius: 12px; width: 100%; padding: 0.7rem 0.95rem; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; cursor: pointer; font-weight: 790; letter-spacing: 0.005em; transition: background 140ms ease, color 140ms ease, box-shadow 150ms ease, transform 120ms ease; box-shadow: 0 10px 22px rgba(0,0,0,0.28), 0 0 0 1px rgba(245,158,11,0.18); }
    .copy-btn:hover { background: linear-gradient(125deg, rgba(251,191,36,0.98), rgba(245,158,11,0.95)); color: #0a0a0a; box-shadow: 0 12px 26px rgba(0,0,0,0.3), 0 0 0 1px rgba(245,158,11,0.22); transform: translateY(-1px); }
    .copy-btn:active { background: linear-gradient(125deg, rgba(245,158,11,0.98), rgba(245,158,11,0.95)); box-shadow: 0 8px 18px rgba(0,0,0,0.26), 0 0 0 1px rgba(245,158,11,0.26); transform: translateY(0); }
    .copy-btn.copied { background: rgba(34, 197, 94, 0.25); border-color: rgba(34, 197, 94, 0.5); box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.4); color: #22c55e; }
    .copy-btn:focus-visible { outline: 2px solid rgba(245,158,11,0.5); outline-offset: 3px; }
    .copy-btn__icon { width: 16px; height: 16px; display: block; flex: 0 0 auto; }
    .copy-toast { min-width: 80px; color: ${THEME.colors.accent}; opacity: 0; transform: translateY(4px); transition: opacity 180ms ease, transform 180ms ease; font-weight: 760; font-size: 0.9rem; text-align: left; }
    .copy-toast.visible { opacity: 1; transform: translateY(0); }
    .smartlink-footer .copy-toast { grid-column: 1 / -1; font-size: 0.85rem; }
    .copy-toast--floating {
      position: absolute;
      right: 12px;
      bottom: 54px;
      min-width: 0;
      padding: 0.35rem 0.6rem;
      border-radius: ${THEME.radii.pill};
      border: 1px solid ${THEME.colors.borderSubtle};
      background: rgba(18,18,18,0.78);
      color: ${THEME.colors.textPrimary};
      font-size: 0.82rem;
      font-weight: 760;
      letter-spacing: 0.01em;
      pointer-events: none;
      backdrop-filter: blur(14px) saturate(1.1);
      -webkit-backdrop-filter: blur(14px) saturate(1.1);
      box-shadow: 0 10px 24px rgba(0,0,0,0.35);
    }
    .smartlink-list { 
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.85rem; 
      margin-top: 0.75rem; 
    }
    .smartlink-item--release {
      flex: 0 1 calc(33.333% - 0.6rem);
      min-width: 150px;
      max-width: 220px;
    }
    .smartlink-item { 
      display: flex; 
      flex-direction: column; 
      gap: 0; 
      padding: 0; 
      border-radius: 12px; 
      border: 1px solid rgba(255,255,255,0.08); 
      background: rgba(255,255,255,0.04); 
      cursor: pointer; 
      transition: all 180ms ease; 
      box-shadow: 0 2px 12px rgba(0,0,0,0.1); 
      overflow: hidden; 
    }
    .smartlink-item:focus-visible { outline: 2px solid ${THEME.colors.accent}; outline-offset: 2px; }
    .smartlink-item:hover { border-color: rgba(255,255,255,0.15); background: rgba(255,255,255,0.07); transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
    .smartlink-item:active { transform: translateY(0); }
    .smartlink-main { display: flex; flex-direction: column; gap: 0; color: inherit; text-decoration: none; }
    .smartlink-cover { width: 100%; aspect-ratio: 1 / 1; border-radius: 0; border: none; background: rgba(30,30,30,0.5); box-shadow: none; overflow: hidden; position: relative; }
    .smartlink-content { display: flex; flex-direction: column; gap: 0.08rem; padding: 0.4rem 0.5rem; }
    .smartlink-title-row { display: flex; align-items: center; justify-content: space-between; gap: 0.3rem; }
    .smartlink-title { font-family: 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif; font-size: 0.85rem; font-weight: 700; letter-spacing: -0.01em; color: ${THEME.colors.textPrimary}; line-height: 1.2; }
    .platform-chip { display: inline-flex; align-items: center; justify-content: center; padding: 0.18rem 0.55rem; border-radius: ${THEME.radii.pill}; background: rgba(46,46,46,0.55); border: 1px solid ${THEME.colors.borderSubtle}; color: ${THEME.colors.textSecondary}; font-weight: 740; font-size: 0.82rem; min-width: 2rem; text-align: center; gap: 0.3rem; }
    .platform-chip::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: ${THEME.colors.accent}; box-shadow: 0 0 0 3px rgba(245,158,11,0.08); }
    .meta-row { display: flex; flex-wrap: wrap; gap: 0.35rem 0.65rem; align-items: center; color: ${THEME.colors.textSecondary}; font-size: 0.9rem; }
    .meta-row.subtle { color: ${THEME.colors.textMuted}; font-size: 0.8rem; }
    .artists-grid .meta-row.subtle { font-size: 0.7rem; line-height: 1.3; }
    .meta-dot { width: 4px; height: 4px; border-radius: 50%; background: ${THEME.colors.textFaint}; display: inline-block; }
    .pill { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.3rem 0.7rem; border-radius: ${THEME.radii.pill}; background: ${THEME.colors.surface}; border: 1px solid ${THEME.colors.border}; color: ${THEME.colors.textSecondary}; font-weight: 700; }
    .pill-soft { background: ${THEME.colors.surfaceMuted}; color: ${THEME.colors.textSecondary}; border-color: ${THEME.colors.border}; }
    .artist-hero {
      position: relative;
      width: 100%;
      line-height: 0;
    }
    .artist-hero__img {
      width: 100%;
      max-width: 100%;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      object-position: center 30%;
      display: block;
      -webkit-mask-image: linear-gradient(to bottom, black 0%, black 60%, transparent 100%);
      mask-image: linear-gradient(to bottom, black 0%, black 60%, transparent 100%);
    }
    .artist-body {
      display: flex;
      flex-direction: row;
      align-items: flex-end;
      justify-content: space-between;
      gap: 1rem;
      padding: 0 1.5rem 1rem;
      margin-top: -2.5rem;
      position: relative;
      z-index: 2;
    }
    .artist-info {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.15rem;
      text-align: left;
    }
    .artist-name { 
      font-family: 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif; 
      color: #FFFFFF; 
      font-size: 1.75rem; 
      font-weight: 700; 
      letter-spacing: -0.02em;
      line-height: 1.15;
      margin: 0;
    }
    .artist-meta { 
      color: rgba(255,255,255,0.5); 
      font-size: 0.95rem; 
      font-weight: 500;
    }
    .artist-share {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      flex-shrink: 0;
    }
    .artist-share .share-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      padding: 0.5rem 1rem;
      border-radius: 20px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      color: rgba(255,255,255,0.5);
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 150ms ease;
    }
    .artist-share .share-btn:hover {
      background: rgba(255,255,255,0.08);
      color: rgba(255,255,255,0.7);
    }
    .artist-share .share-btn svg { width: 14px; height: 14px; }
    .smartlink-item--release { position: relative; }
    .smartlink-item--release .smartlink-title { font-size: 0.88rem; line-height: 1.25; font-weight: 600; }
    .smartlink-item--release .meta-row { margin-top: 0.05rem; font-size: 0.75rem; }
    .smartlink-item__copy { position: absolute; right: 6px; top: 6px; z-index: 2; padding: 0.35rem 0.4rem; border-radius: 8px; background: rgba(0,0,0,0.55); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: none; }
    .smartlink-footer { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 0.5rem; }
    .copy-btn--ghost { background: rgba(255,255,255,0.04); color: ${THEME.colors.textSecondary}; box-shadow: none; border: 1px solid ${THEME.colors.borderSubtle}; padding: 0.5rem 0.65rem; min-height: 0; font-size: 0.92rem; font-weight: 760; width: auto; }
    .copy-btn--ghost:hover { background: rgba(255,255,255,0.08); color: ${THEME.colors.textPrimary}; box-shadow: 0 8px 18px rgba(0,0,0,0.26); }
    .copy-btn--ghost:active { background: rgba(255,255,255,0.06); box-shadow: none; }
    .copy-btn--icon { width: auto; min-height: 0; padding: 0.45rem 0.55rem; border-radius: 12px; background: rgba(255,255,255,0.04); color: ${THEME.colors.textSecondary}; box-shadow: none; border: 1px solid ${THEME.colors.borderSubtle}; }
    .copy-btn--icon:hover { background: rgba(255,255,255,0.08); color: ${THEME.colors.textPrimary}; box-shadow: 0 8px 18px rgba(0,0,0,0.22); }
    .copy-btn--icon:active { background: rgba(255,255,255,0.06); box-shadow: none; }
    .empty-state { padding: 1.4rem; border-radius: 12px; border: 1px dashed ${THEME.colors.border}; background: ${THEME.colors.surfaceMuted}; color: ${THEME.colors.textSecondary}; }
    .powered-by {
      display: flex;
      justify-content: center;
      margin-top: 1.5rem;
      padding-top: 1.5rem;
    }
    .powered-by__stack {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      gap: 0.4rem;
      width: fit-content;
    }
    .powered-by__text {
      color: ${THEME.colors.textMuted};
      font-size: 0.75rem;
      letter-spacing: 0.01em;
      opacity: 0.7;
      white-space: nowrap;
    }
    .powered-by__text strong { color: ${THEME.colors.textSecondary}; font-weight: 860; }
    .powered-by__logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.8);
      opacity: 0.7;
      transition: opacity 140ms ease, transform 120ms ease;
      width: 45%;
      max-width: 72px;
    }
    .powered-by__logo:hover { opacity: 1; transform: translateY(-1px); }
    .powered-by__logo:active { transform: translateY(0); }
    .powered-by__logo svg { width: 100%; height: auto; display: block; }
    @media (max-width: 1100px) {
      .links-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 768px) {
      .release-grid { grid-template-columns: 1fr; justify-items: stretch; }
      .release-grid .header { text-align: center; width: 100%; align-items: center; }
      .release-grid .links-grid { width: 100%; }
      .artist-line { justify-content: center; }
      .release-date { text-align: center; }
      .canonical-row { align-items: center; }
      .links-grid { grid-template-columns: 1fr; }
      .smartlink-footer { grid-template-columns: 1fr; }
      .home-top { text-align: center; align-items: center; }
      .home-badge { margin: 0 auto; }
      .home-actions { justify-content: center; }
      .home-features { grid-template-columns: 1fr; }
      .home-footer { justify-content: center; }
      .home-hero { grid-template-columns: 1fr; justify-items: center; }
      .home-visual { width: min(260px, 100%); height: auto; aspect-ratio: 1 / 1; }
    }
    @media (max-width: 640px) {
      body { padding: 1.25rem; }
      .card { padding: 1.4rem; width: calc(100% - 16px); }
      h1 { font-size: 1.5rem; }
      .cover { max-width: min(92vw, 420px); }
      .smartlink-title-row { align-items: flex-start; }
      .links-grid { grid-template-columns: 1fr; }
      .smartlink-list { gap: 0.6rem; }
      .smartlink-item--release .smartlink-content { padding: 0.5rem 0.6rem; }
      .smartlink-item--release .smartlink-title { font-size: 0.82rem; }
      .smartlink-item--release .meta-row { font-size: 0.7rem; }
      .smartlink-item__copy { right: 5px; top: 5px; padding: 0.3rem 0.35rem; }
      body.page-artist .card { width: calc(100% - 24px); }
      .artist-body { padding: 0 1.4rem 0.85rem; margin-top: -2rem; }
      .artist-name { font-size: 1.5rem; }
      .artist-content { padding: 0 1.4rem 1.4rem 1.4rem; }
      .copy-toast--floating { bottom: 45px; right: 8px; font-size: 0.75rem; padding: 0.3rem 0.5rem; }
      .copy-btn:not(.copy-btn--ghost):not(.copy-btn--icon) { width: 100%; }
      /* Smartlink release page mobile */
      .smartlink-release__body { padding: 0 1.25rem 0.65rem; margin-top: -1.5rem; gap: 0.9rem; }
      .smartlink-release__title { font-size: 1.3rem; }
      .smartlink-release__links .link-btn { padding: 0.8rem 1rem; font-size: 0.9rem; gap: 0.8rem; }
      .link-btn__icon { width: 22px; height: 22px; }
      .share-social { width: 38px; height: 38px; }
      .share-social svg { width: 16px; height: 16px; }
      body.page-smartlink .card { width: calc(100% - 24px); }
      /* Artists list page mobile */
      body.page-artists .card { width: calc(100% - 24px); padding: 1.25rem; }
      .artists-header { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
      .artists-header__title { font-size: 1.5rem; }
      .artists-header__count { align-self: flex-start; }
      .artists-grid { grid-template-columns: repeat(2, 1fr); gap: 0.6rem; }
      .artists-grid .smartlink-item { width: 100%; max-width: 100%; }
      .artists-loading { grid-template-columns: repeat(2, 1fr); gap: 0.6rem; }
      .artists-controls { flex-direction: column; gap: 0.6rem; }
      .artists-sort-buttons { width: 100%; justify-content: flex-start; }
      .artists-sort-btn { flex: 1; min-width: 0; }
      .artists-pagination { gap: 0.6rem; }
      .artists-pagination__btn { padding: 0.45rem 0.8rem; font-size: 0.8rem; }
    }
    @media (max-width: 480px) {
      body { padding: 1rem 0.85rem; }
      .card { padding: 1.1rem; width: calc(100% - 12px); }
      .release-grid { gap: 1rem; }
      .canonical-row { align-items: center; gap: 0.5rem; }
      .smartlink-list { gap: 0.5rem; }
      .smartlink-item { border-radius: 10px; }
      .smartlink-item--release .smartlink-content { padding: 0.45rem 0.5rem; }
      .smartlink-item--release .smartlink-title { font-size: 0.78rem; }
      .smartlink-item--release .meta-row { font-size: 0.65rem; }
      .smartlink-item__copy { padding: 0.25rem 0.3rem; border-radius: 6px; right: 4px; top: 4px; }
      body.page-artist .card { width: calc(100% - 16px); border-radius: 20px; }
      .artist-body { padding: 0 1.1rem 0.75rem; margin-top: -1.5rem; gap: 0.75rem; }
      .artist-name { font-size: 1.3rem; }
      .artist-meta { font-size: 0.85rem; }
      .artist-content { padding: 0 1.1rem 1.1rem 1.1rem; }
      .copy-btn--ghost { padding: 0.35rem 0.5rem; font-size: 0.82rem; }
      /* Smartlink release page small mobile */
      .smartlink-release__body { padding: 0 1rem 0.6rem; margin-top: -1.25rem; gap: 0.8rem; }
      .smartlink-release__title { font-size: 1.2rem; }
      .smartlink-release__artist { font-size: 0.85rem; }
      .smartlink-release__links { gap: 0.45rem; }
      .smartlink-release__links .link-btn { padding: 0.7rem 0.9rem; font-size: 0.88rem; gap: 0.7rem; border-radius: 14px; }
      .link-btn__icon { width: 20px; height: 20px; }
      .share-social { width: 36px; height: 36px; }
      .share-social svg { width: 15px; height: 15px; }
      body.page-smartlink .card { width: calc(100% - 16px); border-radius: 20px; }
      /* Artists list page small mobile */
      body.page-artists .card { width: calc(100% - 16px); padding: 1rem; border-radius: 20px; }
      .artists-header__title { font-size: 1.3rem; }
      .artists-header__subtitle { font-size: 0.82rem; }
      .artists-search__input { padding: 0.65rem 0.9rem 0.65rem 2.25rem; font-size: 0.9rem; }
      .artists-grid { grid-template-columns: repeat(2, 1fr); gap: 0.5rem; }
      .artists-grid .smartlink-item { width: 100%; max-width: 100%; }
      .artists-loading { grid-template-columns: repeat(2, 1fr); gap: 0.5rem; }
    }
  </style>
</head>
<body class="${escapeHtml(pageClass || "")}" style="${backgroundStyle}" ${backgroundAttribute}>
  <div class="noise-layer"></div>
  <main class="card release-card">
    ${body}
  </main>
  <footer class="powered-by" aria-label="powered by SREDA">
    <div class="powered-by__stack">
      <div class="powered-by__text">powered by <strong>SREDA</strong></div>
      <a class="powered-by__logo" href="/" aria-label="SREDA">
        ${poweredLogo}
      </a>
    </div>
  </footer>
  <script>
    (function() {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (prefersReducedMotion.matches) {
        document.documentElement.classList.add('reduce-motion');
      }

      function revealImage(media) {
        media.classList.add('media--ready');
        media.classList.remove('media--loading');
        const img = media.querySelector('.media__img');
        if (img) {
          img.classList.remove('is-loading');
        }
      }

      function showFallback(media) {
        media.classList.add('media--error');
        media.classList.remove('media--loading');
        const img = media.querySelector('.media__img');
        if (img) {
          img.classList.remove('is-loading');
        }
      }

      document.querySelectorAll('.media').forEach((media) => {
        const img = media.querySelector('img.media__img');
        if (!img || !img.getAttribute('src')) {
          showFallback(media);
          return;
        }

        media.classList.add('media--loading');

        const handleLoad = async () => {
          try {
            if (img.decode) {
              await img.decode();
            }
          } catch (error) {
            console.warn('image decode skipped', error);
          }
          revealImage(media);
        };

        const handleError = () => {
          showFallback(media);
        };

        if (img.complete) {
          if (img.naturalWidth > 0) {
            handleLoad();
          } else {
            handleError();
          }
        } else {
          img.addEventListener('load', handleLoad, { once: true });
          img.addEventListener('error', handleError, { once: true });
        }
      });

      const bgImage = document.body.getAttribute('data-bg-image');
      if (bgImage) {
        const loader = new Image();
        loader.onload = () => {
          // не использовать backticks внутри HTML template literal, ломает сборку
          document.body.style.setProperty(
            '--page-bg-image',
            'url("' + bgImage.replace(/"/g, '\\"') + '")',
          );
          document.body.classList.add('bg-ready');
        };
        loader.onerror = () => {
          document.body.style.setProperty('--page-bg-opacity', '0');
        };
        loader.src = bgImage;
      }
    })();
  </script>
</body>
</html>`;
}

function renderHome(): Response {
  const telegramUrl = "https://t.me/iskramusic_bot";
  const demoArtist = "/artist/boris";
  const demoSmartlink = "/boris/heavy-rain";
  const body = `
    <section class="home">
      <div class="home-hero">
        <div class="home-top">
          <div class="home-badge">SREDA · tools for artists</div>
          <h1 class="home-title">Инструменты для артистов</h1>
          <p class="home-lead">
            Релиз‑план, смартлинки, напоминания, кабинеты артиста и питчинг — в одном месте.
          </p>
          <div class="home-actions">
            <a class="home-action home-action--primary" href="${escapeHtml(telegramUrl)}" target="_blank" rel="noopener noreferrer">
              Открыть ИСКРУ в Telegram
            </a>
            <a class="home-action home-action--secondary" href="${escapeHtml(demoArtist)}">
              Открыть смартлинки (пример)
            </a>
          </div>
        </div>
        <div class="home-visual" aria-hidden="true">
          <!-- Official SREDA logo (from provided SVG) -->
          <svg width="140" height="140" viewBox="160 120 1240 1260" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
            <defs>
              <filter id="logoShadow" x="-30%" y="-20%" width="160%" height="160%">
                <feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="rgba(0,0,0,0.45)"/>
              </filter>
            </defs>
            <g filter="url(#logoShadow)">
              <polygon fill="#F9A600" points="504.67 149.25 802.96 560.18 654.86 750 805.04 900.19 204.29 1350.75 354.48 900.19 204.29 750 504.67 149.25"/>
              <g fill="#FFFFFF" opacity="0.92">
                <path d="M622.08,1248.19h-54.74c-1.89-9.12-13.84-17.93-27.06-17.93s-21.71,3.78-21.71,11.96c0,24.54,105.39-.32,105.39,58.52,0,28.94-30.2,50.02-79.28,50.02-39.95,0-76.13-19.51-86.51-51.6v-9.75h54.74c3.46,11.33,16.99,18.88,30.2,18.88,15.42,0,23.91-5.66,23.91-12.27,0-19.19-104.13,1.57-104.13-58.2,0-28.31,31.46-51.91,76.76-51.91s72.99,22.97,82.43,52.54v9.75Z"/>
                <path d="M653.54,1189.67h52.85v16.36c11.64-12.58,28-20.13,46.88-20.13v54.74c-4.09-.94-11.01-1.57-16.04-1.57-14.16,0-27.37,7.55-30.83,21.39v86.51h-52.85v-157.3Z"/>
                <path d="M942.96,1287.83v10.07c-9.75,29.89-42.79,52.85-85.57,52.85-50.02,0-86.83-32.09-86.83-82.43s36.81-82.43,86.83-82.43c47.19,0,81.17,28.31,85.57,69.84v19.51h-118.6c2.52,17.3,15.1,27.68,33.03,27.68,12.9,0,24.22-4.72,30.2-15.1h55.37ZM827.51,1247.24h59.77c-5.35-11.01-15.1-17.3-29.89-17.3-13.84,0-24.54,6.29-29.89,17.3Z"/>
                <path d="M1135.49,1346.97h-52.85v-14.79c-12.27,11.96-28.31,18.56-46.88,18.56-40.58,0-70.16-32.09-70.16-82.43s29.57-82.43,70.16-82.43c18.56,0,34.61,6.92,46.88,18.88v-78.02h52.85v220.22ZM1019.09,1268.32c0,20.45,12.9,32.72,32.72,32.72s32.72-12.27,32.72-32.72-12.9-32.72-32.72-32.72-32.72,12.27-32.72,32.72Z"/>
                <path d="M1336.83,1346.97h-52.85v-14.79c-12.27,11.96-28.31,18.56-46.88,18.56-40.58,0-70.16-32.09-70.16-82.43s29.57-82.43,70.16-82.43c18.56,0,34.61,6.92,46.88,18.88v-15.1h52.85v157.3ZM1285.86,1268.32c0-20.45-12.9-32.72-32.72-32.72s-32.72,12.27-32.72,32.72,12.9,32.72,32.72,32.72,32.72-12.27,32.72-32.72Z"/>
              </g>
            </g>
          </svg>
        </div>
      </div>

      <div class="home-features" role="list">
        <div class="home-feature" role="listitem">
          <div class="home-feature-icon" aria-hidden="true"><span>⚡</span></div>
          <div>
            <div class="home-feature-title">Смартлинк за минуту</div>
            <div class="home-feature-text">Вставь ссылку на релиз — соберём площадки и сделаем аккуратную карточку.</div>
          </div>
        </div>
        <div class="home-feature" role="listitem">
          <div class="home-feature-icon" aria-hidden="true"><span>↗</span></div>
          <div>
            <div class="home-feature-title">Можно пересылать</div>
            <div class="home-feature-text">Карточка без “техкнопок”. Управление — отдельным меню только для владельца.</div>
          </div>
        </div>
        <div class="home-feature" role="listitem">
          <div class="home-feature-icon" aria-hidden="true"><span>🔔</span></div>
          <div>
            <div class="home-feature-title">Напоминания о релизе</div>
            <div class="home-feature-text">Поставь напоминания до и в день релиза — чтобы не забыть про промо.</div>
          </div>
        </div>
        <div class="home-feature" role="listitem">
          <div class="home-feature-icon" aria-hidden="true"><span>✏️</span></div>
          <div>
            <div class="home-feature-title">Редактирование после создания</div>
            <div class="home-feature-text">Меняй обложку и ссылки, обновляй карточку и удаляй смартлинки из бота.</div>
          </div>
        </div>
      </div>

      <div class="home-footer">
        <span>© SREDA</span>
        <span class="meta-divider">•</span>
        <a class="home-inline" href="${escapeHtml(telegramUrl)}" target="_blank" rel="noopener noreferrer">Telegram</a>
      </div>
    </section>
  `;
  return new Response(htmlPage(body, { title: "SREDA — tools for artists", pageClass: "page-home" }), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=UTF-8", ...CACHE_HEADERS },
  });
}

function renderNotFound(message = "Ссылка не найдена"): Response {
  const body = `<h1>404</h1><p class="meta">${escapeHtml(message)}</p>`;
  return new Response(htmlPage(body, { title: "Не найдено" }), {
    status: 404,
    headers: { "Content-Type": "text/html; charset=UTF-8", ...CACHE_HEADERS },
  });
}

function renderError(): Response {
  const body = `<h1>Временная ошибка</h1><p class="meta">Не удалось загрузить данные. Попробуйте позже.</p>`;
  return new Response(htmlPage(body, { title: "Ошибка" }), {
    status: 502,
    headers: { "Content-Type": "text/html; charset=UTF-8", ...CACHE_HEADERS },
  });
}

async function renderArtistPage(artistSlug: string, env: Env, goIndexBase: string): Promise<Response> {
  try {
    const linkIcon = `<svg class="copy-btn__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
      <path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.4a5 5 0 0 0 7.07 7.07L14 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>`;

    const query = await env.DB.prepare(
      `SELECT
        title,
        release_date,
        slug,
        cover_url,
        cover_source,
        cover_version,
        links_json,
        artist_name,
        artist_photo_url,
        updated_at
      FROM smartlinks
      WHERE artist_slug=?1
      ORDER BY updated_at DESC
      LIMIT 400`,
    )
      .bind(artistSlug)
      .all<{
        title: string | null;
        release_date: string | null;
        slug: string;
        cover_url: string | null;
        cover_source: string | null;
        cover_version: number | null;
        links_json: string | null;
        artist_name: string | null;
        artist_photo_url: string | null;
        updated_at: string | null;
      }>();

    const items = query.results ?? [];
    const displayArtistName =
      items.find((item) => item.artist_name?.trim())?.artist_name?.trim() || prettifySlug(artistSlug);
    const canonicalBase = goIndexBase.replace(/\/$/, "");
    const releaseCover = items
      .map((item) => {
        const coverSource = parseCoverSource(
          item.cover_source,
          `[artist ${artistSlug}/${item.slug}] cover_source bg`,
        );
        const coverVersion = normalizeCoverVersionInput(item.cover_version ?? null);
        const resolvedCoverUrl = resolvePreferredCoverUrl({
          coverUrl: item.cover_url,
          coverSource,
          artistSlug,
          slug: item.slug,
          goIndexBase,
          context: `[artist ${artistSlug}/${item.slug}] cover_display bg`,
        });
        return buildCoverUrlWithVersion(resolvedCoverUrl, coverVersion);
      })
      .find((url) => Boolean(url));

    // Use stored artist photo URL if available (populated by bot when creating smartlinks)
    const artistPhoto = items.find((item) => item.artist_photo_url?.trim())?.artist_photo_url?.trim() || null;

    // Use artist photo if available, otherwise fall back to release cover
    const heroImage = artistPhoto || releaseCover;
    const artistCanonicalUrl = `${canonicalBase}/artist/${encodeURIComponent(artistSlug)}`;

    const cards = items.map((record) => {
      const links = parseLinksFromJson(record.links_json, `[artist ${artistSlug}/${record.slug}] links`);
      const linkCount = Object.keys(links).length;
        const coverSource = parseCoverSource(record.cover_source, `[artist ${artistSlug}/${record.slug}] cover_source`);
        const coverVersion = normalizeCoverVersionInput(record.cover_version ?? null);
        const coverUrlWithVersion = buildDisplayCoverUrl({
          coverUrl: record.cover_url,
          coverSource,
          artistSlug,
          slug: record.slug,
          goIndexBase,
          coverVersion,
          context: `[artist ${artistSlug}/${record.slug}] cover_display`,
        });
      const canonicalUrl = `${canonicalBase}/${artistSlug}/${record.slug}`;
      const formattedReleaseDate = formatDisplayDate(record.release_date);
      // Simplified meta: only show release date if available
      const metaText = formattedReleaseDate ? escapeHtml(formattedReleaseDate) : "";
      const title = record.title ?? "Релиз";

      return `
        <article class="smartlink-item smartlink-item--release" data-href="${escapeHtml(canonicalUrl)}" tabindex="0" role="link">
          <button class="copy-btn copy-btn--icon smartlink-item__copy" type="button" data-url="${escapeHtml(canonicalUrl)}" aria-label="Скопировать ссылку на релиз" title="Скопировать ссылку">
            ${linkIcon}
          </button>
          <span class="copy-toast copy-toast--floating" role="status" aria-live="polite"></span>
          <a class="smartlink-main" href="${escapeHtml(canonicalUrl)}">
            ${renderMedia({ src: coverUrlWithVersion, alt: title, className: "smartlink-cover" })}
            <div class="smartlink-content">
              <div class="smartlink-title">${escapeHtml(title)}</div>
              ${metaText ? `<div class="meta-row subtle">${metaText}</div>` : ""}
            </div>
          </a>
        </article>
      `;
    });

      const body = `
        <div class="artist-hero">
          ${heroImage ? `<img class="artist-hero__img" src="${escapeHtml(heroImage)}" alt="${escapeHtml(displayArtistName)}" />` : ""}
        </div>
        <div class="artist-body">
          <div class="artist-info">
            <h1 class="artist-name">${escapeHtml(displayArtistName)}</h1>
            <div class="artist-meta">Релизы артиста</div>
          </div>
          <div class="artist-share">
            <button class="share-btn" type="button" data-url="${escapeHtml(artistCanonicalUrl)}" aria-label="Поделиться">
              ${linkIcon}
              <span>Поделиться</span>
            </button>
            <span class="copy-toast" role="status" aria-live="polite"></span>
          </div>
        </div>
        <div class="artist-content">
          ${
            cards.length
            ? `<div class="smartlink-list">${cards.join("\n")}</div>`
            : `<div class="empty-state">Для артиста пока нет смартлинков.</div>`
          }
        </div>
      <script>
        (function() {
          async function copyOrShare(url, title) {
            if (!url) return { ok: false, shared: false };
            
            // Try Web Share API first (works on mobile and some desktop browsers)
            if (typeof navigator.share === 'function') {
              try {
                await navigator.share({ url: url, title: title || 'Поделиться' });
                return { ok: true, shared: true };
              } catch (e) {
                if (e.name === 'AbortError') return { ok: false, shared: true }; // User cancelled
                // Share failed, fall through to clipboard
              }
            }
            
            // Try clipboard API
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
              try {
                await navigator.clipboard.writeText(url);
                return { ok: true, shared: false };
              } catch (e) {
                // Clipboard failed, fall through to execCommand
              }
            }
            
            // Fallback to execCommand
            try {
              const textarea = document.createElement('textarea');
              textarea.value = url;
              textarea.setAttribute('readonly', '');
              textarea.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
              document.body.appendChild(textarea);
              textarea.focus();
              textarea.select();
              const ok = document.execCommand('copy');
              document.body.removeChild(textarea);
              return { ok: ok, shared: false };
            } catch (error) {
              return { ok: false, shared: false };
            }
          }

          function attachCopyHandlers() {
            document.querySelectorAll('.copy-btn[data-url]').forEach((button) => {
              const container = button.closest('.artist-actions') || button.parentElement;
              const toast = container?.querySelector('.copy-toast') || null;
              const card = button.closest('.smartlink-item');

              // Stop propagation on touch to prevent card activation
              button.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
              button.addEventListener('touchend', (e) => e.stopPropagation(), { passive: true });

              button.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                // Remove focus from card if present
                if (card) card.blur();
                
                const urlToCopy = button.getAttribute('data-url') || '';
                const cardTitle = container?.querySelector('.smartlink-title')?.textContent || '';
                const result = await copyOrShare(urlToCopy, cardTitle);
                
                // If shared via native dialog, no need for toast
                if (result.shared) return;
                
                const originalTitle = button.getAttribute('title') || '';

                if (toast) {
                  toast.textContent = result.ok ? 'Ссылка скопирована' : 'Не удалось скопировать';
                  toast.classList.add('visible');
                } else if (originalTitle) {
                  button.setAttribute('title', result.ok ? 'Ссылка скопирована' : 'Не удалось скопировать');
                }

                button.classList.toggle('copied', result.ok);

                window.setTimeout(() => {
                  button.classList.remove('copied');
                  toast?.classList.remove('visible');
                  if (!toast && originalTitle) {
                    button.setAttribute('title', originalTitle);
                  }
                }, result.ok ? 1500 : 1800);
              });
            });
          }

          attachCopyHandlers();

          document.querySelectorAll('.smartlink-item[data-href]').forEach((card) => {
            const href = card.getAttribute('data-href');
            if (!href) return;

            const navigate = () => {
              window.location.href = href;
            };

            card.addEventListener('click', (event) => {
              const target = event.target;
              if (target && target.closest && (target.closest('button') || target.closest('a'))) return;
              navigate();
            });

            card.addEventListener('keydown', (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                navigate();
              }
            });
          });
        })();
      </script>
    `;

    return new Response(htmlPage(body, { title: `${displayArtistName} — SREDA`, backgroundImage: heroImage || null, pageClass: "page-artist" }), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=UTF-8", ...CACHE_HEADERS },
    });
  } catch (error) {
    console.error("[artist] db error", error);
    return renderError();
  }
}

function renderSmartlink(
  artistSlug: string,
  slug: string,
  data: ApiSmartlink,
  goIndexBase: string,
  smartlinkId?: string,
): Response {
  const title = data.title ?? "Релиз";
  const artistName = data.artist_name?.trim() || data.artist?.trim() || prettifySlug(artistSlug);
  const releaseDate = formatDisplayDate(data.release_date);
  const coverVersion = normalizeCoverVersionInput(data.cover_version ?? null);
  const coverUrlWithVersion = buildDisplayCoverUrl({
    coverUrl: data.cover_url ?? null,
    coverSource: data.cover_source ?? null,
    artistSlug,
    slug,
    goIndexBase,
    coverVersion,
    context: `[render ${artistSlug}/${slug}] cover_source`,
  });

  if (coverUrlWithVersion === COVER_PLACEHOLDER_DATA_URL) {
    console.warn(`[render ${artistSlug}/${slug}]: missing cover, using placeholder`, {
      cover_url: data.cover_url ?? null,
      cover_source: data.cover_source ?? null,
    });
  }

  const links = data.links ?? {};
  const orderedEntries: [string, string][] = [];

  for (const key of LINK_ORDER) {
    if (key === "other") {
      continue;
    }
    const url = links[key];
    if (url) {
      orderedEntries.push([key, url]);
    }
  }

  const remaining = Object.entries(links).filter(
    ([platform]) => !LINK_ORDER.includes(platform),
  );
  if (remaining.length) {
    orderedEntries.push(...remaining);
  }

  const otherUrl = links["other"];
  if (otherUrl) {
    orderedEntries.push(["other", otherUrl]);
  }

  const linkCount = orderedEntries.length;
  const canonicalBase = goIndexBase.replace(/\/$/, "");
  const canonicalUrl = `${canonicalBase}/${artistSlug}/${slug}`;
  const artistLink = `<a class="artist-link" href="/artist/${encodeURIComponent(artistSlug)}">${escapeHtml(artistName)}</a>`;

  const linkButtons = orderedEntries
    .map(([platform, url]) => {
      const platformKey = platform.toLowerCase();
      const label = PLATFORM_LABELS[platformKey] || platform.charAt(0).toUpperCase() + platform.slice(1);
      const icon = PLATFORM_ICONS[platformKey] || PLATFORM_ICONS["other"];
      return `<a class="link-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" data-platform="${escapeHtml(platformKey)}">
        <span class="link-btn__icon">${icon}</span>
        <span class="link-btn__label">${escapeHtml(label)}</span>
      </a>`;
    })
    .join("\n");
  const linksClassName = linkCount >= 2 ? "links-grid" : "links-grid links-grid--single";

  const body = `
    <div class="smartlink-release">
      <div class="smartlink-release__cover">
        ${renderMedia({ src: coverUrlWithVersion, alt: title, className: "cover" })}
      </div>
      <div class="smartlink-release__body">
        <div class="smartlink-release__info">
          <h1 class="smartlink-release__title">${escapeHtml(title)}</h1>
          <div class="smartlink-release__artist">
            ${artistLink}
          </div>
          ${releaseDate ? `<div class="smartlink-release__date">${escapeHtml(releaseDate)}</div>` : ""}
        </div>
        <div class="smartlink-release__links">
          ${linkButtons || "<span class=\"smartlink-release__empty\">Ссылок пока нет</span>"}
        </div>
        <div class="smartlink-release__share">
          <button class="share-btn" type="button" data-url="${escapeHtml(canonicalUrl)}" aria-label="Поделиться">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            <span>Поделиться</span>
          </button>
          <span class="copy-toast" role="status" aria-live="polite"></span>
        </div>
      </div>
    </div>
    <script>
      (function() {
        async function copyOrShare(url, title) {
          if (!url) return { ok: false, shared: false };
          
          // Try Web Share API first (works on mobile and some desktop browsers)
          const canShare = navigator.share && (!navigator.canShare || navigator.canShare({ url: url }));
          if (canShare) {
            try {
              await navigator.share({ url: url, title: title || 'Поделиться' });
              return { ok: true, shared: true };
            } catch (e) {
              if (e.name === 'AbortError') return { ok: false, shared: true };
              // Share failed, fall through to clipboard
            }
          }
          
          // Try clipboard API
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            try {
              await navigator.clipboard.writeText(url);
              return { ok: true, shared: false };
            } catch (e) {
              // Clipboard failed, fall through to execCommand
            }
          }
          
          // Fallback to execCommand
          try {
            const textarea = document.createElement('textarea');
            textarea.value = url;
            textarea.setAttribute('readonly', '');
            textarea.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(textarea);
            return { ok: ok, shared: false };
          } catch (error) {
            return { ok: false, shared: false };
          }
        }

        function attachCopyHandlers() {
          document.querySelectorAll('.share-social--copy[data-url], .share-btn[data-url], .copy-btn[data-url]').forEach((button) => {
            const shareContainer = button.closest('.smartlink-release__share');
            const toast = shareContainer?.querySelector('.copy-toast') || button.parentElement?.querySelector('.copy-toast');

            button.addEventListener('click', async (event) => {
              event.preventDefault();
              event.stopPropagation();
              
              const urlToCopy = button.getAttribute('data-url') || '';
              const result = await copyOrShare(urlToCopy, document.title);

              if (result.shared) return;

              if (toast) {
                toast.textContent = result.ok ? 'Ссылка скопирована' : 'Не удалось скопировать';
                toast.classList.add('visible');
              }

              button.classList.toggle('copied', result.ok);

              window.setTimeout(() => {
                button.classList.remove('copied');
                toast?.classList.remove('visible');
              }, result.ok ? 1500 : 1800);
            });
          });
        }

        attachCopyHandlers();
      })();
    </script>
  `;

  return new Response(htmlPage(body, { title: `${title} — ${artistName}`, backgroundImage: coverUrlWithVersion, pageClass: "page-smartlink" }), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=UTF-8", ...CACHE_HEADERS },
  });
}

// Helper to generate artist cards HTML
function generateArtistCards(
  items: Array<{
    artist_slug: string;
    slug: string;
    artist_name: string | null;
    cover_url: string | null;
    cover_source: string | null;
    cover_version: number | null;
    cnt: number | null;
  }>,
  goIndexBase: string
): string[] {
  return items.map((record) => {
    const artistSlug = record.artist_slug;
    const latestSlug = (record.slug || "").trim() || "latest";
    const displayName = (record.artist_name || "").trim() || prettifySlug(artistSlug);
    const coverSource = parseCoverSource(record.cover_source, `[artists] ${artistSlug} cover_source`);
    const coverVersion = normalizeCoverVersionInput(record.cover_version ?? null);
    const coverUrlWithVersion = buildDisplayCoverUrl({
      coverUrl: record.cover_url,
      coverSource,
      artistSlug,
      slug: latestSlug,
      goIndexBase,
      coverVersion,
      context: `[artists] ${artistSlug} cover_display`,
    });
    const artistUrl = `/artist/${encodeURIComponent(artistSlug)}`;
    const count = Number(record.cnt || 0);
    const releaseLabel =
      count % 10 === 1 && count % 100 !== 11
        ? "релиз"
        : count % 10 >= 2 && count % 10 <= 4 && !(count % 100 >= 12 && count % 100 <= 14)
          ? "релиза"
          : "релизов";
    const meta = count ? `${count} ${releaseLabel}` : "";
    const linkIcon = `<svg class="copy-btn__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
      <path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.4a5 5 0 0 0 7.07 7.07L14 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>`;
    const fullArtistUrl = `${goIndexBase}${artistUrl}`;

    return `
      <article class="smartlink-item" role="link" data-name="${escapeHtml(displayName.toLowerCase())}" data-href="${escapeHtml(artistUrl)}" tabindex="0">
        <button class="copy-btn copy-btn--icon smartlink-item__copy" type="button" data-url="${escapeHtml(fullArtistUrl)}" aria-label="Скопировать ссылку на артиста" title="Скопировать ссылку">
          ${linkIcon}
        </button>
        <span class="copy-toast copy-toast--floating" role="status" aria-live="polite"></span>
        <a class="smartlink-main" href="${escapeHtml(artistUrl)}">
          <div class="smartlink-cover-wrapper">
            ${renderMedia({ src: coverUrlWithVersion, alt: displayName, className: "smartlink-cover", fallbackLabel: "ARTIST" })}
            ${meta ? `<div class="artists-card-release-count">${escapeHtml(meta)}</div>` : ""}
          </div>
          <div class="smartlink-content">
            <div class="smartlink-title-row">
              <div class="smartlink-title artists-card-title">${escapeHtml(displayName)}</div>
            </div>
          </div>
        </a>
      </article>
    `;
  });
}

// API endpoint for live search
async function handleArtistsSearch(env: Env, goIndexBase: string, requestUrl: URL): Promise<Response> {
  const PER_PAGE = 12;
  
  try {
    const searchQuery = (requestUrl.searchParams.get("q") || "").trim().toLowerCase();
    const sortParam = (requestUrl.searchParams.get("sort") || "name_asc").trim();
    const page = Math.max(1, parseInt(requestUrl.searchParams.get("page") || "1", 10));
    const offset = (page - 1) * PER_PAGE;

    const conditions: string[] = [];
    const params: (string | number)[] = [];
    
    if (searchQuery) {
      // Ищем с начала любого слова в названии или точное совпадение
      // Ищем: начало строки, после пробела, или точное совпадение
      const nameField = "LOWER(COALESCE(s.artist_name, s.artist_slug))";
      conditions.push(`(${nameField} LIKE ? OR ${nameField} LIKE ? OR ${nameField} = ?)`);
      params.push(`${searchQuery}%`, `% ${searchQuery}%`, searchQuery);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    
    let orderBy = "LOWER(COALESCE(s.artist_name, s.artist_slug)) ASC";
    if (sortParam === "name_desc") orderBy = "LOWER(COALESCE(s.artist_name, s.artist_slug)) DESC";
    else if (sortParam === "releases_desc") orderBy = "l.cnt DESC, LOWER(COALESCE(s.artist_name, s.artist_slug)) ASC";
    else if (sortParam === "date_desc") orderBy = "l.max_ts DESC";

    const countQuery = await env.DB.prepare(
      `SELECT COUNT(DISTINCT artist_slug) as total FROM smartlinks s ${whereClause}`
    ).bind(...params).first<{ total: number }>();
    const totalCount = countQuery?.total ?? 0;
    const totalPages = Math.ceil(totalCount / PER_PAGE);

    const query = await env.DB.prepare(
      `WITH latest AS (
         SELECT artist_slug, MAX(COALESCE(updated_at, created_at, '')) AS max_ts, COUNT(*) AS cnt
         FROM smartlinks
         GROUP BY artist_slug
       )
       SELECT
         s.artist_slug AS artist_slug,
         s.slug AS slug,
         s.artist_name AS artist_name,
         s.cover_url AS cover_url,
         s.cover_source AS cover_source,
         s.cover_version AS cover_version,
         l.cnt AS cnt
       FROM smartlinks s
       JOIN latest l
         ON l.artist_slug = s.artist_slug
        AND COALESCE(s.updated_at, s.created_at, '') = l.max_ts
       ${whereClause}
       GROUP BY s.artist_slug
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`
    ).bind(...params, PER_PAGE, offset).all<{
      artist_slug: string;
      slug: string;
      artist_name: string | null;
      cover_url: string | null;
      cover_source: string | null;
      cover_version: number | null;
      cnt: number | null;
    }>();

    const items = query.results ?? [];
    const cards = generateArtistCards(items, goIndexBase);

    return new Response(JSON.stringify({
      html: cards.join("\n"),
      total: totalCount,
      page,
      totalPages,
      hasMore: page < totalPages
    }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=UTF-8" },
    });
  } catch (error) {
    console.error("[artists/search] db error", error);
    return new Response(JSON.stringify({ error: "Database error" }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=UTF-8" },
    });
  }
}

async function renderArtistsIndex(env: Env, goIndexBase: string, requestUrl: URL): Promise<Response> {
  const PER_PAGE = 12;
  
  try {
    // Parse query params
    const searchQuery = (requestUrl.searchParams.get("q") || "").trim().toLowerCase();
    const sortParam = (requestUrl.searchParams.get("sort") || "name_asc").trim();
    const page = Math.max(1, parseInt(requestUrl.searchParams.get("page") || "1", 10));
    const offset = (page - 1) * PER_PAGE;

    // Build WHERE clause
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    
    if (searchQuery) {
      // Ищем с начала любого слова в названии или точное совпадение
      // Ищем: начало строки, после пробела, или точное совпадение
      const nameField = "LOWER(COALESCE(s.artist_name, s.artist_slug))";
      conditions.push(`(${nameField} LIKE ? OR ${nameField} LIKE ? OR ${nameField} = ?)`);
      params.push(`${searchQuery}%`, `% ${searchQuery}%`, searchQuery);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    
    // Build ORDER BY clause
    let orderBy = "LOWER(COALESCE(s.artist_name, s.artist_slug)) ASC"; // default: А-Я
    if (sortParam === "name_desc") orderBy = "LOWER(COALESCE(s.artist_name, s.artist_slug)) DESC";
    else if (sortParam === "releases_desc") orderBy = "l.cnt DESC, LOWER(COALESCE(s.artist_name, s.artist_slug)) ASC";
    else if (sortParam === "date_desc") orderBy = "l.max_ts DESC";

    // Get total count for pagination
    const countQuery = await env.DB.prepare(
      `SELECT COUNT(DISTINCT artist_slug) as total FROM smartlinks s ${whereClause}`
    ).bind(...params).first<{ total: number }>();
    const totalCount = countQuery?.total ?? 0;
    const totalPages = Math.ceil(totalCount / PER_PAGE);

    // Get paginated results
    const query = await env.DB.prepare(
      `WITH latest AS (
         SELECT artist_slug, MAX(COALESCE(updated_at, created_at, '')) AS max_ts, COUNT(*) AS cnt
         FROM smartlinks
         GROUP BY artist_slug
       )
       SELECT
         s.artist_slug AS artist_slug,
         s.slug AS slug,
         s.artist_name AS artist_name,
         s.cover_url AS cover_url,
         s.cover_source AS cover_source,
         s.cover_version AS cover_version,
         l.cnt AS cnt,
         l.max_ts AS updated_at
       FROM smartlinks s
       JOIN latest l
         ON l.artist_slug = s.artist_slug
        AND COALESCE(s.updated_at, s.created_at, '') = l.max_ts
       ${whereClause}
       GROUP BY s.artist_slug
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`
    ).bind(...params, PER_PAGE, offset).all<{
      artist_slug: string;
      slug: string;
      artist_name: string | null;
      cover_url: string | null;
      cover_source: string | null;
      cover_version: number | null;
      cnt: number | null;
    }>();

    const items = query.results ?? [];
    const cards = generateArtistCards(items, goIndexBase);

    // Build URL helper
    const buildUrl = (overrides: { q?: string; sort?: string; page?: number }) => {
      const params = new URLSearchParams();
      const q = overrides.q !== undefined ? overrides.q : searchQuery;
      const s = overrides.sort !== undefined ? overrides.sort : sortParam;
      const p = overrides.page !== undefined ? overrides.page : page;
      if (q) params.set("q", q);
      if (s && s !== "name_asc") params.set("sort", s);
      if (p > 1) params.set("page", String(p));
      const qs = params.toString();
      return `/artist${qs ? `?${qs}` : ""}`;
    };

    // Sort options
    const sortOptions = [
      { value: "name_asc", label: "А → Я" },
      { value: "name_desc", label: "Я → А" },
      { value: "releases_desc", label: "По релизам" },
      { value: "date_desc", label: "По дате" },
    ];
    const sortButtonsHtml = sortOptions
      .map((o) => {
        const isActive = o.value === sortParam;
        const url = buildUrl({ sort: o.value, page: 1 });
        return `<a href="${escapeHtml(url)}" class="artists-sort-btn${isActive ? " active" : ""}" data-sort="${escapeHtml(o.value)}">${escapeHtml(o.label)}</a>`;
      })
      .join("");

    const artistLabel =
      totalCount % 10 === 1 && totalCount % 100 !== 11
        ? "артист"
        : totalCount % 10 >= 2 && totalCount % 10 <= 4 && !(totalCount % 100 >= 12 && totalCount % 100 <= 14)
          ? "артиста"
          : "артистов";

    const searchIcon = `<svg class="artists-search__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`;
    const clearIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

    // Pagination
    const paginationHtml = totalPages > 1 ? `
      <div class="artists-pagination">
        ${page > 1 ? `<a href="${escapeHtml(buildUrl({ page: page - 1 }))}" class="artists-pagination__btn">← Назад</a>` : `<span class="artists-pagination__btn disabled">← Назад</span>`}
        <span class="artists-pagination__info">${page} из ${totalPages}</span>
        ${page < totalPages ? `<a href="${escapeHtml(buildUrl({ page: page + 1 }))}" class="artists-pagination__btn">Вперёд →</a>` : `<span class="artists-pagination__btn disabled">Вперёд →</span>`}
      </div>
    ` : "";

    const body = `
      <div class="artists-header">
        <div class="artists-header__info">
          <h1 class="artists-header__title">Артисты</h1>
          <div class="artists-header__subtitle">Выбери артиста — откроется список его релизов</div>
        </div>
        <div class="artists-header__count">${totalCount} ${artistLabel}</div>
      </div>
      <form class="artists-controls" method="get" action="/artist" id="artists-form">
        <div class="artists-search">
          ${searchIcon}
          <input type="text" name="q" class="artists-search__input" placeholder="Поиск артиста..." value="${escapeHtml(searchQuery)}" autocomplete="off" aria-label="Поиск артиста" />
          <button type="button" class="artists-search__clear${searchQuery ? " visible" : ""}" aria-label="Очистить поиск">${clearIcon}</button>
        </div>
        <div class="artists-sort-buttons" role="group" aria-label="Сортировка артистов">
          ${sortButtonsHtml}
        </div>
      </form>
      ${
        cards.length
          ? `<div class="artists-grid" role="list" aria-live="polite" aria-label="Список артистов">${cards.join("\n")}</div><div class="artists-empty" id="no-results" style="display:none;" role="status" aria-live="polite">Ничего не найдено</div>`
          : `<div class="artists-empty" role="status" aria-live="polite">${searchQuery ? "Ничего не найдено" : "Пока нет артистов со смартлинками."}</div>`
      }
      ${paginationHtml}
      <script>
      (function() {
        const form = document.getElementById('artists-form');
        const input = form?.querySelector('input[name="q"]');
        const sortButtons = form?.querySelectorAll('.artists-sort-btn');
        const grid = document.querySelector('.artists-grid');
        const noResults = document.getElementById('no-results');
        const clearBtn = form?.querySelector('.artists-search__clear');
        const countEl = document.querySelector('.artists-header__count');
        const paginationEl = document.querySelector('.artists-pagination');
        
        let debounceTimer;
        let currentRequest = null;
        let currentSort = 'name_asc';
        
        // Get current sort from active button
        const activeSortBtn = form?.querySelector('.artists-sort-btn.active');
        if (activeSortBtn) {
          currentSort = activeSortBtn.getAttribute('data-sort') || 'name_asc';
        }
        
        async function search() {
          const query = (input?.value || '').trim();
          const sort = currentSort;
          const searchContainer = form?.querySelector('.artists-search');
          
          // Cancel previous request
          if (currentRequest) currentRequest.abort();
          
          const controller = new AbortController();
          currentRequest = controller;
          
          // Show loading state with skeleton (12 items = 3 rows of 4 or 2 rows of 6)
          if (grid) {
            const skeletonCount = 12;
            grid.innerHTML = Array(skeletonCount).fill(0).map(() => 
              '<div class="artists-loading-item"><div class="artists-loading-item__image"></div><div class="artists-loading-item__text"><div class="artists-loading-item__text-line"></div><div class="artists-loading-item__text-line"></div></div></div>'
            ).join('');
            grid.className = 'artists-loading';
          }
          
          // Add active state to search
          if (searchContainer && query) {
            searchContainer.classList.add('artists-search--active');
          } else if (searchContainer) {
            searchContainer.classList.remove('artists-search--active');
          }
          
          try {
            const params = new URLSearchParams();
            if (query) params.set('q', query);
            if (sort !== 'name_asc') params.set('sort', sort);
            
            const response = await fetch('/api/artists/search?' + params.toString(), {
              signal: controller.signal
            });
            const data = await response.json();
            
            if (grid) {
              grid.className = 'artists-grid';
              grid.innerHTML = data.html || '';
              
              // Re-init media loaders
              grid.querySelectorAll('.media').forEach(initMediaLoader);
            }
            
            if (noResults) {
              noResults.style.display = data.total === 0 ? 'block' : 'none';
            }
            
            // Update count
            if (countEl && data.total !== undefined) {
              const n = data.total;
              const label = n % 10 === 1 && n % 100 !== 11 ? 'артист' 
                : n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14) ? 'артиста' 
                : 'артистов';
              countEl.textContent = n + ' ' + label;
            }
            
            // Update pagination
            if (paginationEl) {
              if (data.totalPages > 1) {
                paginationEl.style.display = 'flex';
                // Could update pagination links here
              } else {
                paginationEl.style.display = 'none';
              }
            }
            
            // Update URL without reload
            const url = new URL(window.location.href);
            if (query) url.searchParams.set('q', query);
            else url.searchParams.delete('q');
            if (sort !== 'name_asc') url.searchParams.set('sort', sort);
            else url.searchParams.delete('sort');
            history.replaceState(null, '', url.toString());
            
          } catch (err) {
            if (err.name !== 'AbortError') {
              console.error('Search error:', err);
              if (grid) {
                grid.className = 'artists-grid';
                grid.style.opacity = '1';
              }
            }
          }
        }
        
        // Helper to init media lazy loading
        function initMediaLoader(media) {
          const img = media.querySelector('.media__img');
          if (!img || !img.src) return;
          
          media.classList.add('media--loading');
          
          const handleLoad = async () => {
            try {
              if (img.decode) await img.decode();
            } catch (e) {}
            media.classList.remove('media--loading');
            media.classList.add('media--ready');
          };
          
          const handleError = () => {
            media.classList.remove('media--loading');
            media.classList.add('media--error');
          };
          
          if (img.complete && img.naturalWidth > 0) {
            handleLoad();
          } else {
            img.addEventListener('load', handleLoad, { once: true });
            img.addEventListener('error', handleError, { once: true });
          }
        }
        
        input?.addEventListener('input', () => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(search, 300);
          
          // Show/hide clear button
          if (clearBtn) {
            clearBtn.classList.toggle('visible', input.value.length > 0);
          }
          
          // Update active state
          const searchContainer = form?.querySelector('.artists-search');
          if (searchContainer) {
            searchContainer.classList.toggle('artists-search--active', input.value.length > 0);
          }
        });
        
        // Handle sort button clicks
        sortButtons?.forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            const sort = btn.getAttribute('data-sort') || 'name_asc';
            currentSort = sort;
            
            // Update active state
            sortButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            search();
          });
        });
        
        // Prevent form submit, use AJAX instead
        form?.addEventListener('submit', (e) => {
          e.preventDefault();
          search();
        });
        
        // Clear button
        clearBtn?.addEventListener('click', (e) => {
          e.preventDefault();
          if (input) {
            input.value = '';
            clearBtn.classList.remove('visible');
            const searchContainer = form?.querySelector('.artists-search');
            if (searchContainer) {
              searchContainer.classList.remove('artists-search--active');
            }
            search();
            input.focus();
          }
        });
        
        // Copy/share handlers
        async function copyOrShare(url, title) {
          if (!url) return { ok: false, shared: false };
          
          if (typeof navigator.share === 'function') {
            try {
              await navigator.share({ url: url, title: title || 'Поделиться' });
              return { ok: true, shared: true };
            } catch (e) {
              if (e.name === 'AbortError') return { ok: false, shared: true };
            }
          }
          
          try {
            await navigator.clipboard.writeText(url);
            return { ok: true, shared: false };
          } catch (error) {
            return { ok: false, shared: false };
          }
        }
        
        function attachCopyHandlers() {
          document.querySelectorAll('.copy-btn[data-url]').forEach((button) => {
            const container = button.closest('.smartlink-item');
            const toast = container?.querySelector('.copy-toast');
            
            button.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
            button.addEventListener('touchend', (e) => e.stopPropagation(), { passive: true });
            
            button.addEventListener('click', async (event) => {
              event.preventDefault();
              event.stopPropagation();
              
              const urlToCopy = button.getAttribute('data-url') || '';
              const cardTitle = container?.querySelector('.smartlink-title')?.textContent || '';
              const result = await copyOrShare(urlToCopy, cardTitle);
              
              if (toast) {
                toast.textContent = result.ok ? (result.shared ? 'Поделено!' : 'Скопировано!') : 'Ошибка';
                toast.classList.add('visible');
                setTimeout(() => {
                  toast.classList.remove('visible');
                }, result.ok ? 1500 : 1800);
              }
            });
          });
        }
        
        attachCopyHandlers();
        
        // Card navigation
        document.querySelectorAll('.smartlink-item[data-href]').forEach((card) => {
          const href = card.getAttribute('data-href');
          if (!href) return;
          
          const navigate = () => {
            window.location.href = href;
          };
          
          card.addEventListener('click', (event) => {
            const target = event.target;
            if (target && target.closest && (target.closest('button') || target.closest('a'))) return;
            navigate();
          });
          
          card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              navigate();
            }
          });
        });
      })();
      </script>
    `;

    return new Response(htmlPage(body, { title: "Артисты — SREDA", pageClass: "page-artists" }), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=UTF-8", ...CACHE_HEADERS },
    });
  } catch (error) {
    console.error("[artists] db error", error);
    return renderError();
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
    const segments = normalizedPath.split("/").filter(Boolean);

    if (normalizedPath === "/api/index/upsert") {
      if (request.method === "GET") {
        return new Response("OK: /api/index/upsert жив. Используй POST + X-API-Key + JSON body.", {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=UTF-8" },
        });
      }

      if (request.method !== "POST") {
        return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
      }

      const apiKey = env.SMARTLINK_API_KEY;
      const apiKeyError = requireEnvValue(
        apiKey,
        "SMARTLINK_API_KEY",
        "Настройте SMARTLINK_API_KEY для доступа к /api/index/upsert.",
      );
      if (apiKeyError) {
        return apiKeyError;
      }

      const providedKey = request.headers.get("X-API-Key");
      const isAuthed = providedKey === apiKey;
      if (!isAuthed) {
        return jsonResponse({ ok: false, error: "unauthorized" }, 401);
      }

      const goIndexBase = env.GO_INDEX_BASE?.replace(/\/$/, "");
      const goIndexBaseError = requireEnvValue(
        goIndexBase,
        "GO_INDEX_BASE",
        "Настройте GO_INDEX_BASE для формирования канонических ссылок.",
      );
      if (goIndexBaseError) {
        return goIndexBaseError;
      }

      await ensureSchema(env.DB);

      try {
        let payload: UpsertRequest;
        try {
          payload = (await request.json()) as UpsertRequest;
        } catch (error) {
          console.error("upsert parse error", error);
          return jsonResponse({ ok: false, error: "bad_request", details: "invalid_json" }, 400);
        }

        const {
          id,
          title,
          artist_name,
          artist,
          release_date,
          cover_source,
          cover_url,
          cover_version,
          links,
          slug,
          artist_slug,
          owner,
          artist_photo_url,
        } = payload ?? {};

        const { artistSlug: computedArtistSlug, releaseSlug: computedSlug, errors: slugErrors } =
          deriveSlugsFromPayload({
            id,
            title,
            artist_name,
            artist,
            artist_slug,
            slug,
          });

        if (!computedArtistSlug || !computedSlug || !title || slugErrors.length) {
          return jsonResponse(
            {
              ok: false,
              error: "bad_request",
              details: {
                fields: slugErrors,
                message: "Не удалось сформировать slug. Проверьте artist_slug и title/slug.",
              },
            },
            400,
          );
        }

        const canonicalId = `${computedArtistSlug}:${computedSlug}`;
        const normalizedLinksResult = normalizeLinksInput(links, "[upsert] links", { strict: true });
        if (normalizedLinksResult.error) {
          return jsonResponse(
            { ok: false, error: "bad_request", details: { links: normalizedLinksResult.error } },
            400,
          );
        }
        const allowlist = enforceLinksAllowlist(normalizedLinksResult.value, "[upsert] links_allowlist");
        if (allowlist.error) {
          return jsonResponse(
            { ok: false, error: "bad_request", details: { links: allowlist.error, rejected: allowlist.rejected } },
            400,
          );
        }
        const linksJson = JSON.stringify(allowlist.value);
        const coverSourceProvided = payload !== undefined && Object.prototype.hasOwnProperty.call(payload, "cover_source");
        const coverUrlProvided = payload !== undefined && Object.prototype.hasOwnProperty.call(payload, "cover_url");
        const normalizedCoverSource = coverSourceProvided
          ? normalizeCoverSourceInput(cover_source, "[upsert] cover_source")
          : null;
        const normalizedCoverUrl = coverUrlProvided ? resolveCoverUrl(cover_url) : null;
        const { owner: normalizedOwner, error: ownerError } = normalizeOwnerInput(owner);

        if (normalizedCoverSource?.error) {
          return jsonResponse(
            { ok: false, error: "bad_request", details: { cover_source: normalizedCoverSource.error } },
            400,
          );
        }

        if (ownerError) {
          return jsonResponse(
            { ok: false, error: "bad_request", details: { owner: ownerError } },
            400,
          );
        }

        let action: "insert" | "update" = "insert";
        let storedCoverUrl: string | null = null;
        let storedCoverFileId: string | null = null;
        let storedCoverVersion = normalizeCoverVersionInput(cover_version);
        let storedCoverSource: string | null = normalizedCoverSource?.value ?? null;
        let storedCoverUpdatedAt: string | null = null;
        let ownerSaved = false;

        try {
          const existingRecord = await env.DB.prepare(
            `SELECT
              id,
              cover_source,
              cover_version,
              cover_url,
              cover_updated_at,
              cover_file_id,
              owner_tg_user_id,
              owner_tg_username,
              owner_display_name
            FROM smartlinks
            WHERE artist_slug=?1 AND slug=?2
            LIMIT 1`,
          )
            .bind(computedArtistSlug, computedSlug)
            .all<{
              id: string;
              cover_source: string | null;
              cover_version: number | null;
              cover_url: string | null;
              cover_updated_at: string | null;
              cover_file_id: string | null;
              owner_tg_user_id: string | null;
              owner_tg_username: string | null;
              owner_display_name: string | null;
            }>();

          const existing = existingRecord.results?.[0];

          if (
            existing?.id &&
            normalizedOwner?.tg_user_id &&
            existing.owner_tg_user_id &&
            normalizedOwner.tg_user_id !== existing.owner_tg_user_id
          ) {
            return jsonResponse(
              {
                ok: false,
                error: "slug_conflict",
                details: {
                  message: "Slug уже используется для другого владельца.",
                  artist_slug: computedArtistSlug,
                  slug: computedSlug,
                },
              },
              409,
            );
          }

          ownerSaved = Boolean(normalizedOwner && !existing?.owner_tg_user_id);
          storedCoverFileId = existing?.cover_file_id ?? null;

          if (!coverSourceProvided) {
            storedCoverSource = existing?.cover_source ?? null;
          }

          const baseCoverVersion = existing?.cover_version ?? 0;
          if (storedCoverVersion !== null) {
            storedCoverVersion = Math.max(0, storedCoverVersion);
          } else if (coverSourceProvided || coverUrlProvided) {
            storedCoverVersion = existing ? baseCoverVersion + 1 : 1;
          } else {
            storedCoverVersion = baseCoverVersion;
          }

          storedCoverVersion ??= 0;

          const defaultCoverUrl = `${goIndexBase}/api/cover/${encodeURIComponent(computedArtistSlug)}/${encodeURIComponent(computedSlug)}`;
          const existingCoverUrl = resolveCoverUrl(existing?.cover_url ?? null);

          if (coverUrlProvided) {
            storedCoverUrl = normalizedCoverUrl;
          } else if (existingCoverUrl) {
            storedCoverUrl = existingCoverUrl;
          } else {
            storedCoverUrl = defaultCoverUrl;
          }

          if (!existing || coverSourceProvided || coverUrlProvided) {
            const parsedCoverSource = parseCoverSource(storedCoverSource, "[upsert] cover_source");
            storedCoverFileId = extractTelegramFileId(
              storedCoverUrl ?? undefined,
              parsedCoverSource,
              "[upsert] cover_file_id",
            );
          }

          const coverChanged =
            coverUrlProvided ||
            coverSourceProvided ||
            storedCoverVersion !== baseCoverVersion;
          storedCoverUpdatedAt = coverChanged
            ? new Date().toISOString()
            : existing?.cover_updated_at ?? null;

          // Normalize artist_photo_url
          const storedArtistPhotoUrl = typeof artist_photo_url === "string" && artist_photo_url.trim()
            ? artist_photo_url.trim()
            : null;

          await env.DB.prepare(
            `INSERT INTO smartlinks (
              id,
              artist_slug,
              slug,
              title,
              artist_name,
              release_date,
              owner_tg_user_id,
              owner_tg_username,
              owner_display_name,
              cover_source,
              cover_file_id,
              cover_version,
              cover_url,
              cover_updated_at,
              links_json,
              artist_photo_url,
              created_at,
              updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, datetime('now'), datetime('now'))
            ON CONFLICT(artist_slug, slug) DO UPDATE SET
              title=excluded.title,
              artist_name=excluded.artist_name,
              release_date=excluded.release_date,
              owner_tg_user_id=COALESCE(smartlinks.owner_tg_user_id, excluded.owner_tg_user_id),
              owner_tg_username=COALESCE(smartlinks.owner_tg_username, excluded.owner_tg_username),
              owner_display_name=COALESCE(smartlinks.owner_display_name, excluded.owner_display_name),
              cover_source=excluded.cover_source,
              cover_file_id=excluded.cover_file_id,
              cover_version=excluded.cover_version,
              cover_url=excluded.cover_url,
              cover_updated_at=excluded.cover_updated_at,
              links_json=excluded.links_json,
              artist_photo_url=COALESCE(excluded.artist_photo_url, smartlinks.artist_photo_url),
              updated_at=datetime('now')`,
          )
            .bind(
              canonicalId,
              computedArtistSlug,
              computedSlug,
              title,
              artist_name ?? null,
              release_date ?? null,
              normalizedOwner?.tg_user_id ?? null,
              normalizedOwner?.username ?? null,
              normalizedOwner?.display_name ?? null,
              storedCoverSource,
              storedCoverFileId,
              storedCoverVersion,
              storedCoverUrl,
              storedCoverUpdatedAt,
              linksJson,
              storedArtistPhotoUrl,
            )
            .run();

          action = existing ? "update" : "insert";
        } catch (error) {
          console.error("[upsert] db error", error);
          return jsonResponse(
            { ok: false, error: "db_error", message: error instanceof Error ? error.message : String(error) },
            500,
          );
        }

        // Синхронизация запускается для входящих upsert по умолчанию.
        // Если запрос приходит из веб-индекса (чтобы избежать циклов), используйте заголовок X-Skip-Sync: 1.
        const skipSync = request.headers.get("X-Skip-Sync") === "1";

        let syncResult: [boolean, number | null, string | null] = [true, null, null];
        if (!skipSync) {
          try {
            syncResult = await syncSmartlinkToWeb(
              {
                ...payload,
                id: canonicalId,
                artist_slug: computedArtistSlug,
                slug: computedSlug,
                artist_name,
                title,
                release_date,
                cover_source: storedCoverSource ?? undefined,
                cover_url: storedCoverUrl ?? undefined,
                cover_version: storedCoverVersion,
                links: allowlist.value,
              },
              env,
            );
          } catch (error) {
            console.warn("smartlink sync error", error);
            syncResult = [false, null, error instanceof Error ? error.message : String(error)];
          }
        } else {
          console.info("smartlink sync skipped", { id: canonicalId, reason: "X-Skip-Sync" });
        }

        const [synced, syncStatus, syncError] = syncResult;
        if (!synced) {
          console.warn("smartlink sync failed", {
            id: canonicalId,
            status: syncStatus,
            error: syncError,
          });
          return jsonResponse(
            { ok: false, error: "sync_failed", details: { status: syncStatus, error: syncError } },
            502,
          );
        }

        return jsonResponse({
          ok: true,
          action,
          artist_slug: computedArtistSlug,
          slug: computedSlug,
          id: canonicalId,
          owner_saved: ownerSaved,
        });
      } catch (err) {
        console.error("[upsert] error", err);
        return jsonResponse(
          { ok: false, error: "server_error", details: String((err as { message?: string } | null)?.message ?? err) },
          500,
        );
      }
    }

    if (normalizedPath === "/api/index/my" || normalizedPath === "/api/my") {
      if (request.method !== "GET") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

      const apiKey = env.SMARTLINK_API_KEY;
      const apiKeyError = requireEnvValue(
        apiKey,
        "SMARTLINK_API_KEY",
        "Настройте SMARTLINK_API_KEY для доступа к /api/index/my.",
      );
      if (apiKeyError) {
        return apiKeyError;
      }

      const providedKey = request.headers.get("X-API-Key");
      if (providedKey !== apiKey) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

      await ensureSchema(env.DB);

      const owner = (url.searchParams.get("owner_tg_user_id") || "").trim();
      const page = Math.max(0, Number(url.searchParams.get("page") || "0") || 0);
      const limitRaw = Number(url.searchParams.get("limit") || "10") || 10;
      const limit = Math.min(25, Math.max(1, limitRaw));
      const offset = page * limit;

      if (!owner) return jsonResponse({ ok: false, error: "bad_request" }, 400);

      const countRes = await env.DB
        .prepare(`SELECT COUNT(*) as cnt FROM smartlinks WHERE owner_tg_user_id = ?`)
        .bind(owner)
        .first<{ cnt: number }>();

      const total = Number(countRes?.cnt || 0);
      const total_pages = Math.max(1, Math.ceil(total / limit));

      const rows = await env.DB
        .prepare(
          `SELECT id, artist_slug, slug, title, artist_name, release_date, cover_url, cover_version, updated_at
           FROM smartlinks
           WHERE owner_tg_user_id = ?
           ORDER BY datetime(updated_at) DESC
           LIMIT ? OFFSET ?`
        )
        .bind(owner, limit, offset)
        .all();

      return jsonResponse({
        ok: true,
        page,
        limit,
        total,
        // Backward-compatible field name expected by iskra-bot
        total_count: total,
        total_pages,
        items: (rows.results || []).map((r: any) => ({
          id: r.id,
          artist_slug: r.artist_slug,
          slug: r.slug,
          title: r.title,
          artist: r.artist_name,
          release_date: r.release_date,
          cover_url: r.cover_url,
          cover_version: r.cover_version,
          updated_at: r.updated_at,
        })),
      });
    }

    // Backward-compatible endpoint expected by iskra-bot:
    // GET /api/smartlinks/:artist_slug/:slug (private, X-API-Key)
    if (segments.length === 4 && segments[0] === "api" && segments[1] === "smartlinks") {
      if (request.method !== "GET") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

      const apiKey = env.SMARTLINK_API_KEY;
      if (!apiKey) return jsonResponse({ ok: false, error: "server_error" }, 500);

      const providedKey = request.headers.get("X-API-Key");
      if (providedKey !== apiKey) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

      await ensureSchema(env.DB);

      const artist_slug = decodeURIComponent(segments[2] || "").trim();
      const slug = decodeURIComponent(segments[3] || "").trim();
      if (!artist_slug || !slug) return jsonResponse({ ok: false, error: "bad_request" }, 400);

      const record = await env.DB
        .prepare(`SELECT * FROM smartlinks WHERE artist_slug=?1 AND slug=?2 LIMIT 1`)
        .bind(artist_slug, slug)
        .first<any>();

      if (!record) return jsonResponse({ ok: false, error: "not_found" }, 404);

      const item = {
        id: record.id,
        artist_slug: record.artist_slug,
        slug: record.slug,
        title: record.title,
        artist: record.artist_name,
        artist_name: record.artist_name,
        release_date: record.release_date,
        cover_url: record.cover_url,
        cover_version: record.cover_version,
        cover_source: parseCoverSource(record.cover_source, "[api/smartlinks] cover_source"),
        cover_file_id: record.cover_file_id,
        owner_tg_user_id: record.owner_tg_user_id,
        owner_tg_username: record.owner_tg_username,
        owner_display_name: record.owner_display_name,
        caption_text: record.caption_text,
        branding_disabled: record.branding_disabled,
        branding_paid: record.branding_paid,
        pre_save_enabled: record.pre_save_enabled,
        reminders_enabled: record.reminders_enabled,
        links: parseLinksFromJson(record.links_json, "[api/smartlinks] links_json"),
        updated_at: record.updated_at,
        created_at: record.created_at,
      };

      return jsonResponse({ ok: true, item });
    }
    
    if (normalizedPath === "/api/index/patch") {
      if (request.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

      const apiKey = env.SMARTLINK_API_KEY;
      const apiKeyError = requireEnvValue(
        apiKey,
        "SMARTLINK_API_KEY",
        "Настройте SMARTLINK_API_KEY для доступа к /api/index/patch.",
      );
      if (apiKeyError) {
        return apiKeyError;
      }

      const providedKey = request.headers.get("X-API-Key");
      if (providedKey !== apiKey) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

      await ensureSchema(env.DB);

      let payload: any;
      try {
        payload = await request.json();
      } catch {
        return jsonResponse({ ok: false, error: "bad_request" }, 400);
      }

      const artist_slug = String(payload?.artist_slug || "").trim();
      const slug = String(payload?.slug || "").trim();
      const owner_tg_user_id = String(payload?.owner_tg_user_id || "").trim();
      const patch = payload?.patch || {};

      if (!artist_slug || !slug || !owner_tg_user_id || typeof patch !== "object") {
        return jsonResponse({ ok: false, error: "bad_request" }, 400);
      }

      const existing = await env.DB
        .prepare(`SELECT * FROM smartlinks WHERE artist_slug = ? AND slug = ? LIMIT 1`)
        .bind(artist_slug, slug)
        .first<any>();

      if (!existing) return jsonResponse({ ok: false, error: "not_found" }, 404);
      if (String(existing.owner_tg_user_id || "") !== owner_tg_user_id) return jsonResponse({ ok: false, error: "forbidden" }, 403);

      // разрешаем менять только конкретные поля
      const next: any = { ...existing };

      if (Object.prototype.hasOwnProperty.call(patch, "title")) next.title = String(patch.title || "").trim();
      if (Object.prototype.hasOwnProperty.call(patch, "artist_name")) next.artist_name = patch.artist_name ? String(patch.artist_name) : null;
      if (Object.prototype.hasOwnProperty.call(patch, "release_date")) next.release_date = patch.release_date ? String(patch.release_date) : null;
      if (Object.prototype.hasOwnProperty.call(patch, "caption_text")) next.caption_text = patch.caption_text ? String(patch.caption_text) : null;

      if (Object.prototype.hasOwnProperty.call(patch, "links")) {
        const normalizedLinksResult = normalizeLinksInput(patch.links, "[patch] links", {
          strict: true,
        });
        if (normalizedLinksResult.error) {
          return jsonResponse(
            { ok: false, error: "bad_request", details: { links: normalizedLinksResult.error } },
            400,
          );
        }
        const allowlist = enforceLinksAllowlist(normalizedLinksResult.value, "[patch] links_allowlist");
        if (allowlist.error) {
          return jsonResponse(
            { ok: false, error: "bad_request", details: { links: allowlist.error, rejected: allowlist.rejected } },
            400,
          );
        }
        next.links_json = JSON.stringify(allowlist.value);
      }

      if (Object.prototype.hasOwnProperty.call(patch, "cover_url")) {
        next.cover_url = patch.cover_url ? resolveCoverUrl(String(patch.cover_url)) : null;
      }

      if (Object.prototype.hasOwnProperty.call(patch, "cover_version")) {
        const v = Number(patch.cover_version);
        next.cover_version = Number.isFinite(v) ? v : next.cover_version;
      }

      const now = new Date().toISOString().replace("T", " ").slice(0, 19);
      next.updated_at = now;

      await env.DB
        .prepare(
          `UPDATE smartlinks SET
            title=?,
            artist_name=?,
            release_date=?,
            links_json=?,
            cover_url=?,
            cover_version=?,
            caption_text=?,
            updated_at=?
           WHERE artist_slug=? AND slug=? AND owner_tg_user_id=?`
        )
        .bind(
          next.title,
          next.artist_name,
          next.release_date,
          next.links_json,
          next.cover_url,
          next.cover_version,
          next.caption_text,
          next.updated_at,
          artist_slug,
          slug,
          owner_tg_user_id
        )
        .run();

      return jsonResponse({ ok: true });
    }

    // Admin endpoint to get smartlinks needing artist photo migration
    if (normalizedPath === "/api/admin/migrate-photos") {
      if (request.method !== "GET") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

      const apiKey = env.SMARTLINK_API_KEY;
      const apiKeyError = requireEnvValue(
        apiKey,
        "SMARTLINK_API_KEY",
        "Настройте SMARTLINK_API_KEY для доступа к /api/admin/migrate-photos.",
      );
      if (apiKeyError) {
        return apiKeyError;
      }

      const providedKey = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ||
        request.headers.get("X-API-Key");
      if (providedKey !== apiKey) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

      await ensureSchema(env.DB);

      try {
        // Get all smartlinks with Yandex links but no artist_photo_url
        const query = await env.DB.prepare(
          `SELECT
            id,
            artist_slug,
            slug,
            title,
            artist_name,
            links_json,
            artist_photo_url
          FROM smartlinks
          WHERE artist_photo_url IS NULL OR artist_photo_url = ''
          ORDER BY updated_at DESC
          LIMIT 500`,
        ).all<{
          id: string;
          artist_slug: string;
          slug: string;
          title: string | null;
          artist_name: string | null;
          links_json: string | null;
          artist_photo_url: string | null;
        }>();

        const items = (query.results ?? [])
          .map((record) => {
            const links = parseLinksFromJson(record.links_json, "[migrate-photos] links_json");
            // Only include if it has a Yandex link
            if (!links.yandex) return null;
            return {
              id: record.id,
              artist_slug: record.artist_slug,
              slug: record.slug,
              title: record.title,
              artist_name: record.artist_name,
              links,
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);

        return jsonResponse({
          ok: true,
          count: items.length,
          items,
        });
      } catch (error) {
        console.error("[api/admin/migrate-photos] db error", error);
        return jsonResponse({ ok: false, error: "db_error" }, 500);
      }
    }
       
    if (normalizedPath === "/api/index/get") {
      if (request.method !== "GET") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

      const apiKey = env.SMARTLINK_API_KEY;
      const apiKeyError = requireEnvValue(
        apiKey,
        "SMARTLINK_API_KEY",
        "Настройте SMARTLINK_API_KEY для доступа к /api/index/get.",
      );
      if (apiKeyError) {
        return apiKeyError;
      }

      const providedKey = request.headers.get("X-API-Key");
      if (providedKey !== apiKey) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

      await ensureSchema(env.DB);

      const artist_slug = (url.searchParams.get("artist_slug") || "").trim();
      const slug = (url.searchParams.get("slug") || "").trim();
      if (!artist_slug || !slug) return jsonResponse({ ok: false, error: "bad_request" }, 400);

      const row = await env.DB
        .prepare(`SELECT * FROM smartlinks WHERE artist_slug = ? AND slug = ? LIMIT 1`)
        .bind(artist_slug, slug)
        .first();

      if (!row) return jsonResponse({ ok: false, error: "not_found" }, 404);

      return jsonResponse({ ok: true, item: row });
    }

    if (segments.length >= 2 && segments[0] === "api" && segments[1] === "smartlinks") {
      const authError = requireIndexAuth(request, env);
      if (authError) {
        return authError;
      }

      await ensureSchema(env.DB);

      if (segments.length === 2 && request.method === "GET") {
        const ownerTgId = getOwnerTgId(url);
        if (!ownerTgId) {
          return jsonResponse({ ok: false, error: "bad_request", details: "missing_owner_tg_id" }, 400);
        }

        try {
          const query = await env.DB.prepare(
            `SELECT * FROM smartlinks WHERE owner_tg_user_id = :tg_id ORDER BY updated_at DESC`,
          )
            .bind(String(ownerTgId))
            .all<{
              id: string;
              artist_slug: string;
              slug: string;
              title: string | null;
              artist_name: string | null;
              release_date: string | null;
              cover_url: string | null;
              cover_source: string | null;
              cover_version: number | null;
              cover_file_id: string | null;
              caption_text: string | null;
              flags: string | null;
              links_json: string | null;
              updated_at: string | null;
              owner_tg_user_id: string | null;
              owner_tg_username: string | null;
              owner_display_name: string | null;
            }>();

          const items = (query.results ?? []).map((record) => ({
            id: record.id,
            artist_slug: record.artist_slug,
            slug: record.slug,
            title: record.title,
            artist_name: record.artist_name,
            release_date: record.release_date,
            cover_url: resolveCoverUrl(record.cover_url ?? null),
            cover_source: parseCoverSource(record.cover_source, "[api/smartlinks] cover_source"),
            cover_version: record.cover_version ?? 0,
            cover_file_id: record.cover_file_id,
            caption_text: record.caption_text,
            flags: record.flags,
            links: parseLinksFromJson(record.links_json, "[api/smartlinks] links_json"),
            updated_at: record.updated_at,
            owner: buildOwnerResponse(record),
          }));

          return jsonResponse({
            ok: true,
            owner_tg_id: String(ownerTgId),
            count: items.length,
            items,
          });
        } catch (error) {
          console.error("[api/smartlinks] list db error", error);
          return jsonResponse({ ok: false, error: "db_error" }, 500);
        }
      }

      if (segments.length === 4 && request.method === "GET") {
        const artistSlug = decodeURIComponent(segments[2]);
        const slug = decodeURIComponent(segments[3]);

        try {
          const query = await env.DB.prepare(
            `SELECT
              id,
              artist_slug,
              slug,
              title,
              artist_name,
              release_date,
              cover_url,
              cover_source,
              cover_version,
              cover_file_id,
              caption_text,
              flags,
              links_json,
              updated_at,
              owner_tg_user_id,
              owner_tg_username,
              owner_display_name
            FROM smartlinks
            WHERE artist_slug=?1 AND slug=?2
            LIMIT 1`,
          )
            .bind(artistSlug, slug)
            .all<{
              id: string;
              artist_slug: string;
              slug: string;
              title: string | null;
              artist_name: string | null;
              release_date: string | null;
              cover_url: string | null;
              cover_source: string | null;
              cover_version: number | null;
              cover_file_id: string | null;
              caption_text: string | null;
              flags: string | null;
              links_json: string | null;
              updated_at: string | null;
              owner_tg_user_id: string | null;
              owner_tg_username: string | null;
              owner_display_name: string | null;
            }>();

          const record = query.results?.[0];
          if (!record) {
            return jsonResponse({ ok: false, error: "not_found" }, 404);
          }

          return jsonResponse({
            ok: true,
            item: {
              id: record.id,
              artist_slug: record.artist_slug,
              slug: record.slug,
              title: record.title,
              artist_name: record.artist_name,
              release_date: record.release_date,
              cover_url: resolveCoverUrl(record.cover_url ?? null),
              cover_source: parseCoverSource(record.cover_source, "[api/smartlinks] cover_source"),
              cover_version: record.cover_version ?? 0,
              cover_file_id: record.cover_file_id,
              caption_text: record.caption_text,
              flags: record.flags,
              links: parseLinksFromJson(record.links_json, "[api/smartlinks] links_json"),
              updated_at: record.updated_at,
              owner: buildOwnerResponse(record),
            },
          });
        } catch (error) {
          console.error("[api/smartlinks] fetch db error", error);
          return jsonResponse({ ok: false, error: "db_error" }, 500);
        }
      }

      if (segments.length === 4 && (request.method === "PUT" || request.method === "PATCH")) {
        const artistSlug = decodeURIComponent(segments[2]);
        const slug = decodeURIComponent(segments[3]);
        const ownerTgId = getOwnerTgId(url);
        if (!ownerTgId) {
          return jsonResponse({ ok: false, error: "bad_request", details: "missing_tg_id" }, 400);
        }

        let payload: Record<string, unknown> = {};
        try {
          payload = (await request.json()) as Record<string, unknown>;
        } catch (error) {
          console.error("[api/smartlinks] update parse error", error);
          return jsonResponse({ ok: false, error: "bad_request", details: "invalid_json" }, 400);
        }

        const hasLinks = Object.prototype.hasOwnProperty.call(payload, "links");
        const hasReleaseDate = Object.prototype.hasOwnProperty.call(payload, "release_date");
        const hasCaptionText = Object.prototype.hasOwnProperty.call(payload, "caption_text");
        const hasFlags = Object.prototype.hasOwnProperty.call(payload, "flags");
        const coverPayloadProvided = Object.prototype.hasOwnProperty.call(payload, "cover");
        let coverSourceProvided = Object.prototype.hasOwnProperty.call(payload, "cover_source");
        let coverUrlProvided = Object.prototype.hasOwnProperty.call(payload, "cover_url");
        let coverFileIdProvided = Object.prototype.hasOwnProperty.call(payload, "cover_file_id");

        const normalizedLinksResult = hasLinks
          ? normalizeLinksInput(payload.links, "[api/smartlinks update] links", { strict: true })
          : null;
        const normalizedReleaseDate = hasReleaseDate
          ? normalizeTextInput(payload.release_date, "[api/smartlinks update] release_date")
          : { value: null, error: null };
        const normalizedCaptionText = hasCaptionText
          ? normalizeTextInput(payload.caption_text, "[api/smartlinks update] caption_text")
          : { value: null, error: null };
        const normalizedFlags = hasFlags
          ? normalizeFlagsInput(payload.flags, "[api/smartlinks update] flags")
          : { value: null, error: null };
        let normalizedCoverSource = coverSourceProvided
          ? normalizeCoverSourceInput(payload.cover_source, "[api/smartlinks update] cover_source")
          : null;
        let normalizedCoverUrl: string | null = null;
        if (coverUrlProvided) {
          const rawCoverUrl = payload.cover_url;
          if (rawCoverUrl === null || rawCoverUrl === undefined || rawCoverUrl === "") {
            normalizedCoverUrl = null;
          } else if (typeof rawCoverUrl === "string") {
            normalizedCoverUrl = resolveCoverUrl(rawCoverUrl);
          } else {
            return jsonResponse({ ok: false, error: "bad_request", details: "invalid_cover_url" }, 400);
          }
        }
        let normalizedCoverFileId: string | null = null;

        if (coverFileIdProvided) {
          const rawFileId = payload.cover_file_id;
          if (rawFileId === null || rawFileId === undefined || rawFileId === "") {
            normalizedCoverFileId = null;
          } else if (typeof rawFileId === "string") {
            const trimmed = rawFileId.trim();
            if (!trimmed) {
              normalizedCoverFileId = null;
            } else if (!validateTelegramFileId(trimmed)) {
              return jsonResponse({ ok: false, error: "bad_request", details: "invalid_cover_file_id" }, 400);
            } else {
              normalizedCoverFileId = trimmed;
            }
          } else {
            return jsonResponse({ ok: false, error: "bad_request", details: "invalid_cover_file_id" }, 400);
          }
        }

        if (coverPayloadProvided && !coverSourceProvided && !coverUrlProvided && !coverFileIdProvided) {
          const rawCover = payload.cover;
          if (typeof rawCover === "string") {
            const telegramFileId = extractTelegramFileIdFromString(rawCover, "[api/smartlinks update] cover");
            if (telegramFileId) {
              coverFileIdProvided = true;
              coverSourceProvided = true;
              normalizedCoverFileId = telegramFileId;
              normalizedCoverSource = {
                value: JSON.stringify({ type: "telegram", file_id: telegramFileId }),
                error: false,
              };
            } else {
              coverUrlProvided = true;
              normalizedCoverUrl = resolveCoverUrl(rawCover);
            }
          } else if (rawCover && typeof rawCover === "object") {
            const candidate = rawCover as { telegram?: unknown; url?: unknown; type?: unknown; file_id?: unknown };
            if (typeof candidate.telegram === "string") {
              const trimmed = candidate.telegram.trim();
              if (!validateTelegramFileId(trimmed)) {
                return jsonResponse(
                  { ok: false, error: "bad_request", details: "invalid_cover_file_id" },
                  400,
                );
              }
              coverFileIdProvided = true;
              coverSourceProvided = true;
              normalizedCoverFileId = trimmed;
              normalizedCoverSource = {
                value: JSON.stringify({ type: "telegram", file_id: trimmed }),
                error: false,
              };
            } else if (typeof candidate.url === "string") {
              coverUrlProvided = true;
              normalizedCoverUrl = resolveCoverUrl(candidate.url);
            } else if (candidate.type) {
              coverSourceProvided = true;
              normalizedCoverSource = normalizeCoverSourceInput(
                candidate,
                "[api/smartlinks update] cover",
              );
            }
          }
        }

        if (normalizedReleaseDate.error || normalizedCaptionText.error || normalizedFlags.error) {
          return jsonResponse({ ok: false, error: "bad_request", details: "invalid_text_input" }, 400);
        }

        if (normalizedLinksResult?.error) {
          return jsonResponse(
            { ok: false, error: "bad_request", details: { links: normalizedLinksResult.error } },
            400,
          );
        }
        const allowlist = normalizedLinksResult
          ? enforceLinksAllowlist(normalizedLinksResult.value, "[api/smartlinks update] links_allowlist")
          : null;
        if (allowlist?.error) {
          return jsonResponse(
            { ok: false, error: "bad_request", details: { links: allowlist.error, rejected: allowlist.rejected } },
            400,
          );
        }

        if (normalizedCoverSource?.error) {
          return jsonResponse(
            { ok: false, error: "bad_request", details: { cover_source: normalizedCoverSource.error } },
            400,
          );
        }

        try {
          const existingQuery = await env.DB.prepare(
            `SELECT
              id,
              links_json,
              release_date,
              caption_text,
              flags,
              cover_source,
              cover_url,
              cover_version,
              cover_updated_at,
              cover_file_id,
              owner_tg_user_id,
              owner_tg_username,
              owner_display_name
            FROM smartlinks
            WHERE artist_slug=?1 AND slug=?2
            LIMIT 1`,
          )
            .bind(artistSlug, slug)
            .all<{
              id: string;
              links_json: string | null;
              release_date: string | null;
              caption_text: string | null;
              flags: string | null;
              cover_source: string | null;
              cover_url: string | null;
              cover_version: number | null;
              cover_updated_at: string | null;
              cover_file_id: string | null;
              owner_tg_user_id: string | null;
              owner_tg_username: string | null;
              owner_display_name: string | null;
            }>();

          const existing = existingQuery.results?.[0];
          if (!existing) {
            return jsonResponse({ ok: false, error: "not_found" }, 404);
          }

          if (!existing.owner_tg_user_id || String(existing.owner_tg_user_id) !== ownerTgId) {
            return jsonResponse({ ok: false, error: "forbidden" }, 403);
          }

          const storedLinksJson = hasLinks ? JSON.stringify(allowlist?.value ?? {}) : existing.links_json;
          const storedReleaseDate = hasReleaseDate ? normalizedReleaseDate.value : existing.release_date;
          const storedCaptionText = hasCaptionText ? normalizedCaptionText.value : existing.caption_text;
          const storedFlags = hasFlags ? normalizedFlags.value : existing.flags;

          let storedCoverSource = existing.cover_source;
          let storedCoverUrl = existing.cover_url;
          let storedCoverFileId = existing.cover_file_id;

          if (coverSourceProvided) {
            storedCoverSource = normalizedCoverSource?.value ?? null;
          }

          if (coverUrlProvided) {
            storedCoverUrl = normalizedCoverUrl;
          }

          if (coverFileIdProvided) {
            storedCoverFileId = normalizedCoverFileId;
            if (!coverSourceProvided) {
              storedCoverSource = normalizedCoverFileId
                ? JSON.stringify({ type: "telegram", file_id: normalizedCoverFileId })
                : null;
            }
          }

          if (!coverFileIdProvided && coverSourceProvided) {
            const parsedCover = parseCoverSource(storedCoverSource, "[api/smartlinks update] cover_source");
            if (isTelegramCoverSource(parsedCover)) {
              storedCoverFileId = parsedCover.file_id.trim();
            } else {
              storedCoverFileId = null;
            }
          }

          const baseCoverVersion = existing.cover_version ?? 0;
          const coverChanged = coverSourceProvided || coverUrlProvided || coverFileIdProvided;
          const storedCoverVersion = coverChanged ? baseCoverVersion + 1 : baseCoverVersion;
          const storedCoverUpdatedAt = coverChanged ? new Date().toISOString() : existing.cover_updated_at;

          await env.DB.prepare(
            `UPDATE smartlinks
            SET
              links_json=?1,
              release_date=?2,
              caption_text=?3,
              flags=?4,
              cover_source=?5,
              cover_url=?6,
              cover_version=?7,
              cover_updated_at=?8,
              cover_file_id=?9,
              updated_at=datetime('now')
            WHERE artist_slug=?10 AND slug=?11`,
          )
            .bind(
              storedLinksJson,
              storedReleaseDate,
              storedCaptionText,
              storedFlags,
              storedCoverSource,
              storedCoverUrl,
              storedCoverVersion,
              storedCoverUpdatedAt,
              storedCoverFileId,
              artistSlug,
              slug,
            )
            .run();

          const normalizedLinksOutput = storedLinksJson
            ? parseLinksFromJson(storedLinksJson, "[api/smartlinks update] links_json")
            : {};

          return jsonResponse({
            ok: true,
            item: {
              id: existing.id,
              artist_slug: artistSlug,
              slug,
              release_date: storedReleaseDate,
              cover_url: resolveCoverUrl(storedCoverUrl ?? null),
              cover_source: parseCoverSource(storedCoverSource, "[api/smartlinks update] cover_source"),
              cover_version: storedCoverVersion,
              cover_file_id: storedCoverFileId,
              caption_text: storedCaptionText,
              flags: storedFlags,
              links: normalizedLinksOutput,
              owner: buildOwnerResponse(existing),
            },
          });
        } catch (error) {
          console.error("[api/smartlinks] update db error", error);
          return jsonResponse({ ok: false, error: "db_error" }, 500);
        }
      }

      return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
    }

    if (request.method !== "GET") {
      return renderNotFound();
    }

    await ensureSchema(env.DB);

    const goIndexBase =
      env.GO_INDEX_BASE?.replace(/\/$/, "") ?? new URL(request.url).origin;
    if (!env.GO_INDEX_BASE) {
      console.warn("[env] GO_INDEX_BASE missing, falling back to request origin");
    }

    if (segments.length >= 3 && segments[0] === "api" && segments[1] === "cover") {
      if (segments.length === 3) {
        const canonicalId = decodeURIComponent(segments[2]);
        return handleCoverById(request, env, canonicalId);
      }

      if (segments.length === 4) {
        const artistSlug = decodeURIComponent(segments[2]);
        const slug = decodeURIComponent(segments[3]);
        return handleCoverBySlug(request, env, artistSlug, slug);
      }
    }

    if (segments.length === 2 && segments[0] === "api" && segments[1] === "my") {
      const authError = requireIndexAuth(request, env);
      if (authError) {
        return authError;
      }

      const normalizedTgUserId = getOwnerTgId(url);

      if (!normalizedTgUserId) {
        return jsonResponse({ ok: false, error: "bad_request", details: "missing_tg_user_id" }, 400);
      }

      try {
        const query = await env.DB.prepare(
          `SELECT * FROM smartlinks WHERE owner_tg_user_id = :tg_id ORDER BY updated_at DESC`,
        )
          .bind(String(normalizedTgUserId))
          .all<{
            id: string;
            artist_slug: string;
            slug: string;
            title: string | null;
            artist_name: string | null;
            release_date: string | null;
            cover_url: string | null;
            cover_source: string | null;
            cover_version: number | null;
            cover_file_id: string | null;
            caption_text: string | null;
            flags: string | null;
            links_json: string | null;
            cover_updated_at: string | null;
            created_at: string | null;
            updated_at: string | null;
            owner_tg_user_id: string | null;
            owner_tg_username: string | null;
            owner_display_name: string | null;
          }>();

        const items = (query.results ?? []).map((record) => ({
          id: record.id,
          artist_slug: record.artist_slug,
          slug: record.slug,
          title: record.title,
          artist_name: record.artist_name,
          release_date: record.release_date,
          cover_url: resolveCoverUrl(record.cover_url ?? null),
          cover_source: parseCoverSource(record.cover_source, "[api/my] cover_source"),
          cover_version: record.cover_version ?? 0,
          cover_file_id: record.cover_file_id,
          cover_updated_at: record.cover_updated_at,
          caption_text: record.caption_text,
          flags: record.flags,
          links: parseLinksFromJson(record.links_json, "[api/my] links_json"),
          created_at: record.created_at,
          updated_at: record.updated_at,
          owner: buildOwnerResponse(record),
        }));

        return jsonResponse({
          ok: true,
          tg_user_id: String(normalizedTgUserId),
          items,
          count: items.length,
        });
      } catch (error) {
        console.error("[api/my] db error", error);
        return jsonResponse({ ok: false, error: "db_error" }, 500);
      }
    }

    if (normalizedPath === "/health") {
      return new Response("OK: sreda-go | GIT-LIVE", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=UTF-8", ...CACHE_HEADERS },
      });
    }

    if (normalizedPath === "/debug") {
      const hasDB = Boolean(env.DB);
      const hasSMARTLINK_API_KEY = Boolean(env.SMARTLINK_API_KEY);
      const hasISKRA_API_BASE = Boolean(env.ISKRA_API_BASE);
      const hasISKRA_API_KEY = Boolean(env.ISKRA_API_KEY);
      const hasTelegramToken = Boolean(env.TELEGRAM_BOT_TOKEN);

      return jsonResponse({
        ok: true,
        hasDB,
        hasSMARTLINK_API_KEY,
        hasISKRA_API_BASE,
        hasISKRA_API_KEY,
        hasTelegramToken,
        vars: {
          ISKRA_API_BASE: env.ISKRA_API_BASE ?? null,
        },
      });
    }

    if (
      segments.length === 3 &&
      segments[0] === "debug" &&
      segments[1] === "iskra" &&
      segments[2] === "latest"
    ) {
      const base = env.ISKRA_API_BASE?.replace(/\/$/, "");

      if (!base) {
        return jsonResponse(
          {
            ok: false,
            error: "missing_env",
            details: {
              env: "ISKRA_API_BASE",
              message: "Настройте ISKRA_API_BASE для доступа к ИСКРА API.",
            },
          },
          503,
        );
      }

      const urlToFetch = `${base}/api/smartlink/latest`;
      const headers: HeadersInit = {};

      if (env.ISKRA_API_KEY) {
        headers["X-API-Key"] = env.ISKRA_API_KEY;
      }

      try {
        const iskraResponse = await fetch(urlToFetch, { headers });
        const bodyText = await iskraResponse.text();

        return jsonResponse({
          iskra_base: env.ISKRA_API_BASE,
          has_key: Boolean(env.ISKRA_API_KEY),
          url: urlToFetch,
          status: iskraResponse.status,
          ok: iskraResponse.ok,
          body: bodyText.slice(0, 2000),
        });
      } catch (error) {
        return jsonResponse({
          iskra_base: env.ISKRA_API_BASE,
          has_key: Boolean(env.ISKRA_API_KEY),
          url: urlToFetch,
          status: null,
          ok: false,
          body: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (
      segments.length === 3 &&
      segments[0] === "debug" &&
      segments[1] === "iskra"
    ) {
      const id = decodeURIComponent(segments[2]);
      const base = env.ISKRA_API_BASE?.replace(/\/$/, "");

      if (!base) {
        return jsonResponse(
          {
            ok: false,
            error: "missing_env",
            details: {
              env: "ISKRA_API_BASE",
              message: "Настройте ISKRA_API_BASE для доступа к ИСКРА API.",
            },
          },
          503,
        );
      }

      const urlToFetch = `${base}/api/smartlink/${id}`;
      const headers: HeadersInit = {};

      if (env.ISKRA_API_KEY) {
        headers["X-API-Key"] = env.ISKRA_API_KEY;
      }

      try {
        const iskraResponse = await fetch(urlToFetch, { headers });
        const bodyText = await iskraResponse.text();

        return jsonResponse({
          iskra_base: env.ISKRA_API_BASE,
          has_key: Boolean(env.ISKRA_API_KEY),
          url: urlToFetch,
          status: iskraResponse.status,
          ok: iskraResponse.ok,
          body: bodyText.slice(0, 2000),
        });
      } catch (error) {
        return jsonResponse({
          iskra_base: env.ISKRA_API_BASE,
          has_key: Boolean(env.ISKRA_API_KEY),
          url: urlToFetch,
          status: null,
          ok: false,
          body: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (segments.length === 3 && segments[0] === "cover" && segments[1] === "telegram") {
      const fileId = decodeURIComponent(segments[2]);
      return handleTelegramCover(request, env, fileId);
    }

    if (segments.length === 3 && segments[0] === "_cover") {
      const artistSlug = decodeURIComponent(segments[1]);
      const slug = decodeURIComponent(segments[2]);

      return handleCoverProxy(request, env, artistSlug, slug);
    }

    if (segments.length === 1 && segments[0] === "artist") {
      return renderArtistsIndex(env, goIndexBase, url);
    }

    // API endpoint for live artist search
    if (segments.length === 3 && segments[0] === "api" && segments[1] === "artists" && segments[2] === "search") {
      return handleArtistsSearch(env, goIndexBase, url);
    }

    if (segments.length === 2 && segments[0] === "artist") {
      const artistSlug = decodeURIComponent(segments[1]);
      return renderArtistPage(artistSlug, env, goIndexBase);
    }

    if (segments.length === 0) {
      return renderHome();
    }

    if (segments.length === 1) {
      const candidate = segments[0];
      const reserved = new Set(["artist", "api", "cover", "_cover", "debug"]);

      if (!reserved.has(candidate)) {
        const target = `/artist/${encodeURIComponent(candidate)}`;
        const redirectUrl = new URL(target, url.origin);
        return Response.redirect(redirectUrl.toString(), 302);
      }
    }

    if (segments.length !== 2) {
      return renderNotFound();
    }

    const [artistSlug, slug] = segments.map((segment) => decodeURIComponent(segment));

    try {
      const query = await env.DB.prepare(
        `SELECT
          id,
          artist_slug,
          slug,
          title,
          artist_name,
          release_date,
          cover_source,
          cover_version,
          cover_url,
          links_json
        FROM smartlinks
        WHERE artist_slug=?1 AND slug=?2
        LIMIT 1`,
      )
        .bind(artistSlug, slug)
        .all<{
          id: string;
          artist_slug: string;
          slug: string;
          title: string | null;
          artist_name: string | null;
          release_date: string | null;
          cover_source: string | null;
          cover_version: number | null;
          cover_url: string | null;
          links_json: string | null;
        }>();

      const record = query.results?.[0];
      if (!record?.id) {
        return renderNotFound("Смартлинк не найден");
      }

      const links = parseLinksFromJson(record.links_json, `[render ${artistSlug}/${slug}]`);

      const coverSource = parseCoverSource(record.cover_source, `[render ${artistSlug}/${slug}] cover_source`);

      if (!Object.keys(links).length) {
        console.warn(`[render ${artistSlug}/${slug}]: no links to render`, record.links_json);
      }

      const resolvedCoverUrl = resolvePreferredCoverUrl({
        coverUrl: record.cover_url,
        coverSource,
        artistSlug,
        slug,
        goIndexBase,
        context: `[render ${artistSlug}/${slug}] cover_source preferred`,
      });

      const data: ApiSmartlink = {
        id: record.id,
        title: record.title ?? undefined,
        artist: record.artist_name ?? undefined,
        artist_name: record.artist_name ?? undefined,
        release_date: record.release_date ?? undefined,
        cover_version: record.cover_version ?? undefined,
        cover_url: resolvedCoverUrl ?? undefined,
        cover_source: coverSource ?? undefined,
        links,
      };

      return renderSmartlink(artistSlug, slug, data, goIndexBase, record.id);
    } catch (error) {
      console.error("smartlink fetch error", error);
      return renderError();
    }
  },
};
