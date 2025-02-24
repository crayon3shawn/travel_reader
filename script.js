// 首先引入 PDF.js
const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = '//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileBadge = document.getElementById('fileBadge');
const badgeIcon = document.getElementById('badgeIcon');
const badgeText = document.getElementById('badgeText');

// 在文件頂部添加
const loadingOverlay = document.getElementById('loadingOverlay');

// 拖放事件處理
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length) {
        handleFiles(files[0]);
    }
});

// 點擊上傳
uploadArea.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (event) => {
    if (event.target.files.length) {
        handleFiles(event.target.files[0]);
    }
});

async function handleFiles(file) {
    try {
        // 先顯示載入狀態
        showLoadingState();
        loadingOverlay.classList.remove('hidden');
        
        // 顯示文件類型圖標
        const fileTypeIcon = document.getElementById('fileTypeIcon');
        const uploadText = document.getElementById('uploadText');
        
        fileTypeIcon.classList.remove('hidden');
        fileTypeIcon.textContent = getFileTypeIcon(file.type);
        uploadText.textContent = `已上傳：${file.name}`;

        // 顯示 badge
        badgeIcon.textContent = getFileTypeIcon(file.type);
        badgeText.textContent = file.name;
        fileBadge.classList.remove('hidden');

        // 根據文件類型處理
        const fileType = file.type;
        let data;

        if (fileType.startsWith('image/')) {
            data = await handleImage(file);
        } else if (fileType === 'application/pdf') {
            data = await handlePDF(file);
        } else if (fileType === 'application/json') {
            data = await handleJSON(file);
        } else {
            throw new Error('不支援的檔案格式');
        }

        // 將解析後的數據保存到 LocalStorage
        if (data) {
            await saveData(data);
        }

    } catch (error) {
        console.error('Error processing file:', error);
        showErrorState(error);
    } finally {
        // 隱藏載入動畫
        loadingOverlay.classList.add('hidden');
    }
}

function getFileTypeIcon(fileType) {
    if (fileType.startsWith('image/')) return '🖼️';
    if (fileType === 'application/pdf') return '📄';
    if (fileType === 'application/json') return '📊';
    return '📁';
}

async function extractTextFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(item => item.str).join(' ');
    }

    return fullText;
}

function extractInfoWithRegex(content) {
    // 機場
    const airportMatch = content.match(/(機場|空港|Airport)[：: ]*(.+?)(\n|$)/i) ||
                        content.match(/目的地[：: ]*(.+?機場)/i);
    const airport = airportMatch ? airportMatch[2] || airportMatch[1] : null;

    // 航班號
    const flightMatch = content.match(/(航班|班次|Flight)[：: ]*([A-Z]{2,3}\d{2,4})(\n|$)/i) ||
                       content.match(/([A-Z]{2,3}\d{2,4})/);
    const flight = flightMatch ? flightMatch[2] || flightMatch[1] : null;

    // 時間
    const timeMatch = content.match(/(起飛時間|出發時間|Departure)[：: ]*(\d{1,2}[:：]\d{2})(\n|$)/i) ||
                     content.match(/(\d{1,2}[:：]\d{2})/);
    const time = timeMatch ? timeMatch[2] || timeMatch[1] : null;

    // 飯店
    const hotelMatch = content.match(/(酒店|飯店|旅館|Hotel|Resort)[：: ]*(.+?)(\n|$)/i) ||
                      content.match(/住宿[：: ]*(.+?)(\n|$)/i);
    const hotel = hotelMatch ? hotelMatch[2] || hotelMatch[1] : null;

    return { airport, flight, time, hotel };
}

// 修改航班格式解析
const flightPatterns = [
    // 表格格式 (2025/03/08 六 亞洲航空 AK171 高雄機場 13:35 吉隆坡機場 18:00)
    {
        pattern: /(\d{4}\/\d{2}\/\d{2})\s+\S+\s+(\S+航空)\s+([A-Z]{2}\d{3})\s+(\S+)機場\s+(\d{2}:\d{2})\s+(\S+)機場\s+(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2})/g,
        extract: (match) => ({
            date: match[1],
            airline: match[2],
            flightNumber: match[3],
            origin: {
                city: match[4],
                code: getAirportCode(match[4]),
                time: match[5]
            },
            destination: {
                city: match[6],
                code: getAirportCode(match[6]),
                time: match[8]
            }
        })
    },
    // 舊格式 (02/19 CI839 高雄 曼谷 14:45 17:35)
    {
        pattern: /(\d{2}\/\d{2})\s+(CI\d{3})\s+高\s*雄\s+曼\s*谷\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})|(\d{2}\/\d{2})\s+(CI\d{3})\s+曼\s*谷\s+高\s*雄\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})/g,
        extract: (match) => {
            if (match[1]) { // 出發航班
                return {
                    date: formatDate(match[1]),
                    airline: 'China Airlines',
                    flightNumber: match[2],
                    origin: {
                        city: '高雄',
                        code: 'KHH',
                        time: match[3]
                    },
                    destination: {
                        city: '曼谷',
                        code: 'BKK',
                        time: match[4]
                    }
                };
            } else { // 回程航班
                return {
                    date: formatDate(match[5]),
                    airline: 'China Airlines',
                    flightNumber: match[6],
                    origin: {
                        city: '曼谷',
                        code: 'BKK',
                        time: match[7]
                    },
                    destination: {
                        city: '高雄',
                        code: 'KHH',
                        time: match[8]
                    }
                };
            }
        }
    }
];

// 修改飯店格式解析
const hotelPatterns = [
    // 表格格式 (2025/03/08 PUTRAJAYA 布特拉再也 MOXY PUTRAJAYA...)
    {
        pattern: /(\d{4}\/\d{2}\/\d{2})\s+([A-Z\s]+)\s+(\S+)\s+([^T]+)\s+T:(\d{2,3}-\d{1,3}-\s*\d+)/g,
        extract: (match) => ({
            date: match[1],
            location: match[2].trim(),
            locationZh: match[3],
            hotel: match[4].trim(),
            contact: match[5].trim()
        })
    },
    // 舊格式
    {
        pattern: /(\d{2}\/\s*\d{2})\s+(.*?)(Mercure Bangkok Makkasan|A-One Bangkok Hotel)\s*(\+\d+[\d\s-]+)/g,
        extract: (match) => ({
            date: formatDate(match[1].replace(/\s+/g, '')),
            hotel: match[3].trim(),
            contact: match[4].trim(),
            location: 'Bangkok',
            locationZh: '曼谷'
        })
    }
];

// 更新機場代碼映射
const airportCodes = {
    '高雄': 'KHH',
    '吉隆坡': 'KUL',
    'KLIA': 'KUL',
    '台北': 'TPE',
    '曼谷': 'BKK',
    '布特拉再也': 'SZB',
    '麻六甲': 'MKZ',
    '波得申': 'PDI'
};

// 修改 analyzeFileContent 函數中的錯誤處理
async function analyzeFileContent(content) {
    try {
        console.log('Original content:', content);
        
        let departureFlight = null;
        let returnFlight = null;
        const hotels = [];

        // 嘗試所有航班格式
        for (const format of flightPatterns) {
            let match;
            let matches = [];
            while ((match = format.pattern.exec(content)) !== null) {
                console.log('Found flight match:', match);
                matches.push(format.extract(match));
            }
            if (matches.length >= 2) {
                [departureFlight, returnFlight] = matches;
                break;
            }
        }

        // 嘗試所有飯店格式
        for (const format of hotelPatterns) {
            let match;
            while ((match = format.pattern.exec(content)) !== null) {
                console.log('Found hotel match:', match);
                hotels.push(format.extract(match));
            }
            if (hotels.length > 0) break;
        }

        // 驗證數據
        if (!departureFlight || !returnFlight) {
            console.warn('無法找到完整的航班資訊');
            return null;
        }

        if (hotels.length === 0) {
            console.warn('無法找到飯店資訊');
        }

        return {
            departureFlight,
            returnFlight,
            accommodation: hotels
        };

    } catch (error) {
        console.error('Error analyzing content:', error);
        return null;
    }
}

// 輔助函數：根據城市名稱獲取機場代碼
function getAirportCode(city) {
    const airportCodes = {
        '高雄': 'KHH',
        '吉隆坡': 'KUL',
        'KLIA': 'KUL',
        '台北': 'TPE',
        '曼谷': 'BKK'
        // 可以繼續添加更多機場代碼
    };
    return airportCodes[city] || city;
}

async function handleImage(file) {
    try {
        // 這裡可以加入 OCR 處理
        alert('圖片文件需要 OCR 處理，目前僅支援 PDF 和 JSON');
    } catch (error) {
        console.error('Error processing image:', error);
        alert('處理圖片文件時發生錯誤');
    }
}

async function handlePDF(file) {
    try {
        // 確保資訊容器已經清空並顯示載入狀態
        const infoContainer = document.querySelector('.info-container');
        infoContainer.innerHTML = `
            <div>
                <h2 class="text-xl font-semibold text-[#595141] mb-4">航班資訊</h2>
                <div id="flightContainer" class="space-y-4"></div>
            </div>
            <div class="mt-6">
                <h2 class="text-xl font-semibold text-[#595141] mb-4">住宿資訊</h2>
                <div id="hotelContainer" class="space-y-4"></div>
            </div>
        `;
        
        showLoadingState();

        const text = await extractTextFromPDF(file);
        if (!text) {
            throw new Error('無法讀取 PDF 內容');
        }
        
        const data = await analyzeFileContent(text);
        if (!data) {
            throw new Error('無法解析文件內容');
        }
        
        await displayTravelInfo(data);
        return data;
    } catch (error) {
        console.error('Error processing PDF:', error);
        showErrorState(error);
        return null;
    }
}

function handleJSON(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            displayTravelInfo(data);
        } catch (error) {
            alert('JSON 格式錯誤');
            console.error('Error parsing JSON:', error);
        }
    };
    reader.readAsText(file);
}

// 更新天氣 API 設定
const WEATHER_API_KEY = 'SE6BL6BQQARHYHU54795YNMKK';
const WEATHER_API_BASE_URL = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';

const cityMap = {
    'Kaohsiung': {
        zh: '高雄',
        cityEn: 'Kaohsiung,Taiwan',  // 加入國家以提高準確性
        code: 'KHH',
        country: 'Taiwan'
    },
    'Bangkok': {
        zh: '曼谷',
        cityEn: 'Bangkok,Thailand',
        code: 'BKK',
        country: 'Thailand'
    }
};

// 城市名稱轉換函數
function getCityInfo(cityName) {
    // 先檢查是否已經是英文名稱
    if (cityMap[cityName]) {
        return cityMap[cityName];
    }

    // 尋找中文對應的英文名稱
    for (const [eng, info] of Object.entries(cityMap)) {
        if (info.zh === cityName) {
            return info;
        }
    }

    return null;
}

// 確保在 DOM 完全加載後再綁定事件
document.addEventListener('DOMContentLoaded', function() {
    const myButton = document.getElementById('myButton');
    if (myButton) {
        myButton.addEventListener('click', function() {
            // 事件處理邏輯
        });
    } else {
        console.warn('Element with ID "myButton" not found.');
    }
});

async function getWeather(city, date) {
    try {
        const cityInfo = getCityInfo(city);
        const location = cityInfo ? cityInfo.cityEn : city; // 使用英文名稱
        const formattedDate = date.replace(/\//g, '-'); // 確保日期格式為 YYYY-MM-DD
        const encodedCity = encodeURIComponent(location); // 確保城市名稱正確編碼
        const response = await fetch(`https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodedCity}/${formattedDate}?key=${WEATHER_API_KEY}&unitGroup=metric&include=current`);
        
        if (!response.ok) {
            throw new Error(`Weather API error: ${response.status}`);
        }

        const data = await response.json();
        if (!data.currentConditions) {
            throw new Error('Weather data is incomplete.');
        }

        return {
            condition: data.currentConditions.conditions,
            temp: data.currentConditions.temp
        };
    } catch (error) {
        console.error('Error fetching weather:', error);
        throw new Error('無法獲取天氣資訊');
    }
}

// 修改 hotelInfo 映射，統一使用日式風格配色
const hotelInfo = {
    'Mercure Bangkok Makkasan': {
        website: 'https://all.accor.com/hotel/9104/index.en.shtml',
        address: '1599 Kamphaeng Phet 7 Road, Makkasan, Ratchathewi, 10400 Bangkok',
        color: 'bg-[#F7F3E9]'  // 米色
    },
    'A-One Bangkok Hotel': {
        website: 'https://www.aonehotel.com/bangkok/',
        address: '9/1 Ratchadapisek Road, Huai Khwang, Bangkok 10310',
        color: 'bg-[#F7F3E9]'  // 保持一致的配色
    }
};

// 添加防抖函數
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 使用 DocumentFragment 優化 DOM 操作
function createCards(data) {
    const fragment = document.createDocumentFragment();
    
    // 創建航班卡片
    const flightCards = createFlightCards(data);
    fragment.appendChild(flightCards);
    
    // 創建住宿卡片
    const hotelCards = createHotelCards(data);
    fragment.appendChild(hotelCards);
    
    return fragment;
}

// 分離航班卡片創建邏輯
function createFlightCards(data) {
    const container = document.createElement('div');
    container.className = 'space-y-4 opacity-0';
    
    // 出發航班
    const departureCard = createFlightCard(data.departureFlight, '出發航班', 'card-delay-1');
    container.appendChild(departureCard);
    
    // 回程航班
    const returnCard = createFlightCard(data.returnFlight, '回程航班', 'card-delay-2');
    container.appendChild(returnCard);
    
    // 添加動畫
    requestAnimationFrame(() => {
        container.classList.add('fade-in');
    });
    
    return container;
}

// 分離住宿卡片創建邏輯
function createHotelCards(data) {
    const container = document.createElement('div');
    container.className = 'space-y-4 opacity-0';
    
    data.accommodation.forEach((hotel, index) => {
        const card = createHotelCard(hotel, index);
        card.classList.add(`card-delay-${index + 3}`);
        container.appendChild(card);
    });
    
    // 添加動畫
    requestAnimationFrame(() => {
        container.classList.add('fade-in');
    });
    
    return container;
}

// 優化數據處理
const dataProcessor = {
    cache: new Map(),
    
    async process(content) {
        const hash = await this.hashContent(content);
        if (this.cache.has(hash)) {
            return this.cache.get(hash);
        }
        
        const data = await analyzeFileContent(content);
        this.cache.set(hash, data);
        return data;
    },
    
    async hashContent(content) {
        const encoder = new TextEncoder();
        const data = encoder.encode(content);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }
};

// 優化顯示邏輯
async function displayTravelInfo(data) {
    try {
        if (!data || !data.departureFlight || !data.returnFlight) {
            throw new Error('無法解析航班資訊');
        }

        // 先移除所有現有內容
        const infoContainer = document.querySelector('.info-container');
        infoContainer.innerHTML = `
            <div>
                <h2 class="text-xl font-semibold text-[#595141] mb-4">航班資訊</h2>
                <div id="flightContainer" class="space-y-4"></div>
            </div>
            <div class="mt-6">
                <h2 class="text-xl font-semibold text-[#595141] mb-4">住宿資訊</h2>
                <div id="hotelContainer" class="space-y-4"></div>
            </div>
        `;

        showLoadingState();
        
        // 獲取容器
        const flightContainer = document.getElementById('flightContainer');
        const hotelContainer = document.getElementById('hotelContainer');

        // 確保容器存在
        if (!flightContainer || !hotelContainer) {
            throw new Error('找不到必要的容器元素');
        }

        // 清空現有內容
        flightContainer.innerHTML = '';
        hotelContainer.innerHTML = '';

        // 獲取天氣資訊
        const departureWeather = await getWeather(data.departureFlight.origin.city, data.departureFlight.date);
        const destinationWeather = await getWeather(data.departureFlight.destination.city, data.departureFlight.date);
        const returnWeather = await getWeather(data.returnFlight.origin.city, data.returnFlight.date);
        const returnDestWeather = await getWeather(data.returnFlight.destination.city, data.returnFlight.date);

        // 創建並添加航班卡片
        const departureCard = createFlightCard(data.departureFlight, '出發航班', 'fade-in', departureWeather, destinationWeather);
        const returnCard = createFlightCard(data.returnFlight, '回程航班', 'fade-in', returnWeather, returnDestWeather);
        
        flightContainer.appendChild(departureCard);
        flightContainer.appendChild(returnCard);

        // 創建並添加住宿卡片
        data.accommodation.forEach((hotel, index) => {
            const card = createHotelCard(hotel, index);
            hotelContainer.appendChild(card);
        });

        // 移除載入狀態
        hideLoadingState();

    } catch (error) {
        console.error('Error displaying info:', error);
        showErrorState(error);
    }
}

// 修改 saveDataToFile 函數為 saveData
async function saveData(data) {
    try {
        // 保存到 LocalStorage
        localStorage.setItem('travelData', JSON.stringify(data));
        
        // 觸發保存成功事件
        const event = new CustomEvent('dataSaved', { detail: data });
        window.dispatchEvent(event);
        
        // 顯示成功訊息
        showToast('資料已成功保存');
    } catch (error) {
        console.error('Error saving data:', error);
        showToast('保存資料時發生錯誤', 'error');
    }
}

// 讀取數據
function loadData() {
    try {
        const data = localStorage.getItem('travelData');
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error('Error loading data:', error);
        return null;
    }
}

// 添加一個簡單的 Toast 通知功能
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 px-4 py-2 rounded-lg text-white ${
        type === 'success' ? 'bg-green-500' : 'bg-red-500'
    }`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // 3秒後自動消失
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// 頁面加載時自動讀取並顯示數據
window.addEventListener('load', async () => {
    const data = loadData();
    if (data) {
        displayTravelInfo(data);
    }
});

// 添加數據更新事件監聽
window.addEventListener('dataSaved', (event) => {
    displayTravelInfo(event.detail);
});

// 修改 formatDate 函數
function formatDate(dateStr) {
    const [year, month, day] = dateStr.split('/');
    return `${year}-${month}-${day}`;
}

// 添加日期格式化函數用於顯示
function formatDisplayDate(dateString) {
    try {
        const date = new Date(dateString);
        return `${date.getMonth() + 1}月${date.getDate()}日`;
    } catch (error) {
        console.error('Error formatting display date:', error);
        return dateString;
    }
}

// 定義資料結構
const travelData = {
    departureFlight: {
        flightNumber: 'CI839',
        date: '2024-02-19',
        origin: {
            city: 'Kaohsiung',
            code: 'KHH',
            time: '14:45',
            weather: {
                condition: 'Sunny',
                temperature: 25
            }
        },
        destination: {
            city: 'Bangkok',
            code: 'BKK',
            time: '17:35',
            weather: {
                condition: 'Cloudy',
                temperature: 30
            }
        }
    },
    returnFlight: {
        // 類似結構
    },
    accommodation: [
        {
            date: '2024-02-19',
            hotel: 'Mercure Bangkok Makkasan',
            contact: '+66 2 1153333',
            location: 'Bangkok'
        }
        // ...
    ]
};

const i18n = {
    'en': {
        'flight.departure': 'Departure Flight',
        'flight.return': 'Return Flight',
        'weather.sunny': 'Sunny',
        'weather.cloudy': 'Cloudy',
        'time.departure': 'Departure Time',
        'time.arrival': 'Arrival Time'
    },
    'zh': {
        'flight.departure': '出發航班',
        'flight.return': '回程航班',
        'weather.sunny': '晴天',
        'weather.cloudy': '多雲',
        'time.departure': '起飛時間',
        'time.arrival': '抵達時間'
    }
};

function translate(key, lang = 'zh') {
    return i18n[lang][key] || key;
}

// 定義國家代碼和電話格式映射
const PHONE_PATTERNS = {
    // 台灣 (+886)
    'TW': {
        countryCode: '+886',
        patterns: [
            { pattern: /^\+886[2-8]\d{7,8}$/, type: 'landline', format: '+886 X XXXX XXXX' }, // 固話
            { pattern: /^\+886[9]\d{8}$/, type: 'mobile', format: '+886 9XX XXX XXX' }   // 手機
        ]
    },
    // 日本 (+81)
    'JP': {
        countryCode: '+81',
        patterns: [
            { pattern: /^\+81[3]\d{8}$/, type: 'landline', format: '+81 3 XXXX XXXX' },  // 東京固話
            { pattern: /^\+81[4-9]\d{8}$/, type: 'landline', format: '+81 X XXXX XXXX' }, // 其他地區固話
            { pattern: /^\+81[7-9]0\d{8}$/, type: 'mobile', format: '+81 XX XXXX XXXX' }  // 手機
        ]
    },
    // 韓國 (+82)
    'KR': {
        countryCode: '+82',
        patterns: [
            { pattern: /^\+82[2]\d{7,8}$/, type: 'landline', format: '+82 2 XXXX XXXX' },  // 首爾固話
            { pattern: /^\+82[3-6]\d{7,8}$/, type: 'landline', format: '+82 X XXX XXXX' },  // 其他地區固話
            { pattern: /^\+82[1][0-9]\d{7,8}$/, type: 'mobile', format: '+82 1X XXXX XXXX' }  // 手機
        ]
    },
    // 馬來西亞 (+60)
    'MY': {
        countryCode: '+60',
        patterns: [
            { pattern: /^\+60[3]\d{7,8}$/, type: 'landline', format: '+60 3 XXXX XXXX' },  // 吉隆坡固話
            { pattern: /^\+60[2,4-9]\d{7}$/, type: 'landline', format: '+60 X XXX XXXX' },  // 其他地區固話
            { pattern: /^\+60[1][0-9]\d{7,8}$/, type: 'mobile', format: '+60 1X XXXX XXXX' }  // 手機
        ]
    },
    // 緬甸 (+95)
    'MM': {
        countryCode: '+95',
        patterns: [
            { pattern: /^\+95[1]\d{7,8}$/, type: 'landline', format: '+95 1 XXX XXXX' },  // 仰光固話
            { pattern: /^\+95[2-9]\d{7,8}$/, type: 'landline', format: '+95 X XXX XXXX' },  // 其他地區固話
            { pattern: /^\+95[9]\d{8,9}$/, type: 'mobile', format: '+95 9 XXXX XXXX' }  // 手機
        ]
    },
    // 泰國 (+66)
    'TH': {
        countryCode: '+66',
        patterns: [
            { pattern: /^\+66[2]\d{7}$/, type: 'landline', format: '+66 2 XXX XXXX' },  // 曼谷固話
            { pattern: /^\+66[3-7]\d{7}$/, type: 'landline', format: '+66 X XXX XXXX' },  // 其他地區固話
            { pattern: /^\+66[8-9]\d{8}$/, type: 'mobile', format: '+66 X XXXX XXXX' }  // 手機
        ]
    }
};

// 修改電話驗證和格式化函數
function validatePhoneNumber(phone) {
    try {
        const phoneNumber = libphonenumber.parsePhoneNumber(phone);
        return phoneNumber.isValid();
    } catch (error) {
        console.warn('Error validating phone number:', error);
        return false;
    }
}

function formatPhoneNumber(phone) {
    try {
        const phoneNumber = libphonenumber.parsePhoneNumber(phone);
        if (!phoneNumber.isValid()) return phone;
        
        // 格式化: (國碼) 電話號碼
        return `(+${phoneNumber.countryCallingCode}) ${phoneNumber.nationalNumber}`;
    } catch (error) {
        console.warn('Error formatting phone number:', error);
        return phone;
    }
}

// 使用範例
function createHotelCard(hotel, index) {
    const hotelData = hotelInfo[hotel.hotel] || {};
    const section = document.createElement('section');
    section.className = 'bg-white p-6 rounded-lg shadow fade-in';
    
    // 生成 Google Maps 連結
    const mapUrl = hotelData.address ? 
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hotelData.address)}` : 
        null;
    
    section.innerHTML = `
        <h3 class="text-lg font-semibold text-[#595141] mb-4 pb-2 border-b border-[#B4A582] flex items-center justify-between">
            Day ${index + 1}
            <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-[#B4A582] text-white">
                ${formatDisplayDate(hotel.date)}
            </span>
        </h3>
        <div class="space-y-4">
            <div class="flex items-center">
                <span class="text-gray-500 w-14">名稱：</span>
                ${hotelData.website ? 
                    `<a href="${hotelData.website}" target="_blank" class="text-[#595141] hover:text-[#8B7355] hover:underline flex items-center">
                        ${hotel.hotel}
                        <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14">
                            </path>
                        </svg>
                    </a>`
                    : hotel.hotel
                }
            </div>
            ${hotelData.address ? 
                `<div class="flex items-start">
                    <span class="text-gray-500 w-14">地址：</span>
                    <a href="${mapUrl}" target="_blank" class="text-[#595141] hover:text-[#8B7355] hover:underline">
                        ${hotelData.address}
                    </a>
                </div>`
                : ''
            }
            <div class="flex items-center">
                <span class="text-gray-500 w-14">電話：</span>
                <a href="tel:${formatPhoneNumber(hotel.contact)}" class="text-[#595141] hover:text-[#8B7355]">
                    ${formatPhoneNumber(hotel.contact)}
                </a>
            </div>
        </div>
    `;
    
    return section;
}

function showLoadingState() {
    const flightContainer = document.getElementById('flightContainer');
    const hotelContainer = document.getElementById('hotelContainer');
    
    if (flightContainer) {
        flightContainer.innerHTML = `
            <div class="bg-white p-6 rounded-lg shadow animate-pulse">
                <div class="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
                <div class="space-y-3">
                    <div class="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div class="h-4 bg-gray-200 rounded w-1/2"></div>
                    <div class="h-4 bg-gray-200 rounded w-2/3"></div>
                </div>
            </div>
            <div class="bg-white p-6 rounded-lg shadow animate-pulse">
                <div class="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
                <div class="space-y-3">
                    <div class="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div class="h-4 bg-gray-200 rounded w-1/2"></div>
                    <div class="h-4 bg-gray-200 rounded w-2/3"></div>
                </div>
            </div>
        `;
    }
    
    if (hotelContainer) {
        hotelContainer.innerHTML = `
            <div class="bg-white p-6 rounded-lg shadow animate-pulse">
                <div class="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
                <div class="space-y-3">
                    <div class="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div class="h-4 bg-gray-200 rounded w-1/2"></div>
                    <div class="h-4 bg-gray-200 rounded w-2/3"></div>
                </div>
            </div>
        `;
    }
}

// 修改 createFlightCard 函數
function createFlightCard(flightData, title, delayClass, originWeather, destWeather) {
    const section = document.createElement('section');
    section.className = 'bg-white p-6 rounded-lg shadow fade-in';
    
    section.innerHTML = `
        <h3 class="text-lg font-semibold text-[#595141] mb-4 pb-2 border-b border-[#B4A582] flex items-center justify-between">
            ${title}
            <div class="flex items-center gap-2">
                <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-[#B4A582] text-white">
                    ${flightData.flightNumber}
                </span>
            </div>
        </h3>
        <div class="space-y-2 text-[#595141]">
            <p class="flex items-center">
                <span class="text-gray-500 w-14">機場：</span>
                <span class="text-[#595141] font-medium">
                    ${formatAirportCode(flightData.origin.code, flightData.destination.code)}
                </span>
            </p>
            <p class="flex items-center">
                <span class="text-gray-500 w-14">時間：</span>
                <span class="text-[#595141] font-medium">
                    ${flightData.origin.time} - ${flightData.destination.time}
                </span>
            </p>
            <div class="space-y-2">
                <div class="flex items-center">
                    <span class="text-gray-500 w-14">出發：</span>
                    <span class="text-[#595141] font-medium">
                        ${translateWeather(originWeather.condition)} ${originWeather.temp}°C
                    </span>
                </div>
                <div class="flex items-center">
                    <span class="text-gray-500 w-14">抵達：</span>
                    <span class="text-[#595141] font-medium">
                        ${translateWeather(destWeather.condition)} ${destWeather.temp}°C
                    </span>
                </div>
            </div>
        </div>
    `;
    
    return section;
}

// 添加 showErrorState 函數
function showErrorState(error) {
    const container = document.querySelector('.info-container');
    container.innerHTML = `
        <div class="bg-red-50 p-4 rounded-lg">
            <div class="flex">
                <div class="flex-shrink-0">
                    <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                    </svg>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-red-800">發生錯誤</h3>
                    <div class="mt-2 text-sm text-red-700">
                        <p>${error.message}</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// 添加 hideLoadingState 函數
function hideLoadingState() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.classList.add('hidden');
    }
}

// 修改機場代碼映射
const AIRPORT_CODES = {
    // 台灣機場
    'TPE': 'Taoyuan International Airport',
    'KHH': 'Kaohsiung International Airport',
    'TSA': 'Taipei Songshan Airport',
    'RMQ': 'Taichung International Airport',
    
    // 泰國機場
    'BKK': 'Suvarnabhumi Airport',
    'DMK': 'Don Mueang International Airport',
    'CNX': 'Chiang Mai International Airport',
    'HKT': 'Phuket International Airport',
    
    // 日本機場
    'NRT': 'Narita International Airport',
    'HND': 'Haneda Airport',
    'KIX': 'Kansai International Airport',
    'ITM': 'Osaka International Airport',
    'CTS': 'New Chitose Airport',
    'FUK': 'Fukuoka Airport',
    
    // 韓國機場
    'ICN': 'Incheon International Airport',
    'GMP': 'Gimpo International Airport',
    'PUS': 'Gimhae International Airport',
    'CJU': 'Jeju International Airport',
    
    // 緬甸機場
    'RGN': 'Yangon International Airport',
    'MDL': 'Mandalay International Airport',
    'NYU': 'Bagan Nyaung U Airport',
    
    // 馬來西亞機場
    'KUL': 'Kuala Lumpur International Airport',
    'SZB': 'Sultan Abdul Aziz Shah Airport',
    'PEN': 'Penang International Airport',
    'JHB': 'Senai International Airport',
    'BKI': 'Kota Kinabalu International Airport'
};

// 修改機場代碼顯示函數
function formatAirportCode(originCode, destinationCode) {
    try {
        const originAirport = AIRPORT_CODES[originCode];
        const destAirport = AIRPORT_CODES[destinationCode];
        
        if (!originAirport || !destAirport) {
            return `${originCode} → ${destinationCode}`;
        }
        
        return `${originAirport} → ${destAirport}`;
    } catch (error) {
        console.warn('Error formatting airport codes:', error);
        return `${originCode} → ${destinationCode}`;
    }
}

// 添加天氣狀態翻譯
const WEATHER_CONDITIONS = {
    'Clear': '晴天',
    'Sunny': '晴天',
    'Partly cloudy': '局部多雲',
    'Cloudy': '多雲',
    'Overcast': '陰天',
    'Mist': '薄霧',
    'Fog': '霧',
    'Light rain': '小雨',
    'Moderate rain': '中雨',
    'Heavy rain': '大雨',
    'Thunderstorm': '雷雨',
    'Light snow': '小雪',
    'Moderate snow': '中雪',
    'Heavy snow': '大雪',
    'Rain': '雨',
    'Snow': '雪',
    'Drizzle': '毛毛雨',
    'Haze': '霾'
};

// 添加天氣翻譯函數
function translateWeather(condition) {
    return WEATHER_CONDITIONS[condition] || condition;
}

// 檢查是否有未使用的變數或函數，這樣可以清理代碼
function unusedFunction() {
    // 這個函數似乎沒有被使用，考慮移除
}

// 確保所有的事件監聽器都有正確的綁定和解除
document.getElementById('myButton').addEventListener('click', function() {
    // 事件處理邏輯
}); 