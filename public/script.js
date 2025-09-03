// 💻 script.js (Complete and Final Version)
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const canvas = document.getElementById('canvas');
    const totalCaloriesEl = document.getElementById('total-calories');
    const totalProteinEl = document.getElementById('total-protein');
    const calorieGoalDisplay = document.getElementById('calorie-goal-display');
    const proteinGoalDisplay = document.getElementById('protein-goal-display');
    const calorieGoalInput = document.getElementById('calorie-goal');
    const proteinGoalInput = document.getElementById('protein-goal');
    const calorieRing = document.getElementById('calorie-ring');
    const proteinRing = document.getElementById('protein-ring');
    
    // Modal Elements
    const goalModal = document.getElementById('goal-modal');
    const mealEntryModal = document.getElementById('meal-entry-modal');
    const mealEntryContent = document.getElementById('meal-entry-content');
    const mealEntryTitle = document.getElementById('meal-entry-title');
    const modalCloseButtons = document.querySelectorAll('.modal-close-btn');

    // --- State Variables ---
    let activeStream = null;
    let scanningInterval = null;
    let currentMealType = null;
    let dailyData = {
        date: new Date().toLocaleDateString(),
        meals: { breakfast: [], lunch: [], dinner: [], snacks: [] },
        totals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
        goals: { calories: 2000, protein: 120 }
    };
    let currentImageBase64 = null;

    // --- Initialization ---
    loadDailyData();
    updateDashboard();
    renderAllMeals();
    initializeEventListeners(); // Initialize all event listeners

    // --- Functions ---
    
    function initializeEventListeners() {
        // REMOVED the old listener on the entire header
        // NEW listener for ONLY the '+' buttons
        document.querySelectorAll('.add-meal-item-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentMealType = btn.dataset.meal;
                const mealName = currentMealType.charAt(0).toUpperCase() + currentMealType.slice(1);
                mealEntryTitle.textContent = `Add to ${mealName}`;
                openInputContainer(currentMealType);
                mealEntryModal.classList.remove('hidden');
            });
        });

        document.getElementById('edit-goals-btn').addEventListener('click', () => goalModal.classList.remove('hidden'));
        document.getElementById('save-goals-btn').addEventListener('click', updateGoals);
        
        modalCloseButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const modalId = btn.getAttribute('data-modal-id');
                document.getElementById(modalId).classList.add('hidden');
                if (modalId === 'meal-entry-modal') {
                    closeInputContainer(); 
                }
            });
        });

        document.querySelectorAll('.meal-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); 
                const mealType = btn.getAttribute('data-meal');
                if (confirm(`Are you sure you want to delete all items from ${mealType}?`)) {
                    dailyData.meals[mealType] = [];
                    recalculateTotals();
                    saveDailyData();
                    renderAllMeals();
                    updateDashboard();
                }
            });
        });
    }

    function openInputContainer(mealType) {
        mealEntryContent.innerHTML = `
            <video class="video-feed" width="100%" height="240" autoplay playsinline style="display: none; border-radius: 8px; margin-bottom: 12px;"></video>
            <div class="button-group">
                <label for="modal-file-upload" class="custom-file-upload">
                    <i data-lucide="upload"></i> Upload Image
                </label>
                <input id="modal-file-upload" type="file" accept="image/*" capture="environment" style="display:none;"/>
                <button class="camera-btn" type="button">
                    <i data-lucide="camera"></i> Open Camera
                </button>
            </div>
            <div class="result-display"></div>
            <button class="back-btn styled-back-btn" type="button">
                <i data-lucide="arrow-left"></i> Back
            </button>
        `;
        if (window.lucide?.createIcons) lucide.createIcons();

        const fileInput = document.getElementById('modal-file-upload');
        fileInput.addEventListener('change', (e) => handleFileUpload(e, mealType));

        const camBtn = mealEntryContent.querySelector('.camera-btn');
        camBtn.addEventListener('click', (e) => toggleCamera(mealType, e.currentTarget));

        const backBtn = mealEntryContent.querySelector('.back-btn');
        backBtn.addEventListener('click', () => closeInputContainer());
    }

    function closeInputContainer() {
        stopCamera();
        currentImageBase64 = null;
        mealEntryContent.innerHTML = '';
        mealEntryModal.classList.add('hidden');
    }

    function handleFileUpload(event, mealType) {
        const file = event.target.files?.[0];
        if (file) {
            stopCamera();
            const reader = new FileReader();
            reader.onload = (e) => {
                currentImageBase64 = e.target.result;
                analyzeImage(currentImageBase64, mealType);
            };
            reader.readAsDataURL(file);
            event.target.value = '';
        }
    }

    async function toggleCamera(mealType, buttonEl) {
        if (activeStream) {
            stopCamera();
            buttonEl.innerHTML = '<i data-lucide="camera"></i> Open Camera';
        } else {
            await startCamera(mealType);
            buttonEl.innerHTML = '<i data-lucide="video-off"></i> Close Camera';
        }
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    async function startCamera(mealType) {
        const videoEl = mealEntryContent.querySelector('.video-feed');
        try {
            activeStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
            videoEl.srcObject = activeStream;
            videoEl.style.display = 'block';
            await videoEl.play();
            await new Promise(res => {
                if (videoEl.readyState >= 2 && videoEl.videoWidth) return res();
                videoEl.onloadedmetadata = () => res();
            });
            if (scanningInterval) clearInterval(scanningInterval);
            scanningInterval = setInterval(() => captureAndAnalyze(mealType), 2500);
        } catch (err) { console.error("Error accessing camera: ", err); }
    }

    function stopCamera() {
        if (activeStream) activeStream.getTracks().forEach(track => track.stop());
        activeStream = null;
        if (scanningInterval) clearInterval(scanningInterval);
        scanningInterval = null;
        const cameraBtn = mealEntryContent.querySelector('.camera-btn');
        if (cameraBtn) {
            cameraBtn.innerHTML = '<i data-lucide="camera"></i> Open Camera';
            if (window.lucide?.createIcons) lucide.createIcons();
        }
        const videoEl = mealEntryContent.querySelector('.video-feed');
        if (videoEl) videoEl.style.display = 'none';
    }

    function captureAndAnalyze(mealType) {
        if (!activeStream) return;
        const videoEl = mealEntryContent.querySelector('.video-feed');
        if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return;
        const context = canvas.getContext('2d');
        if (!context) return;
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
        context.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        currentImageBase64 = canvas.toDataURL('image/jpeg');
        analyzeImage(currentImageBase64, mealType);
    }
    
    async function analyzeImage(imageBase64, mealType) {
        const resultDisplay = mealEntryContent.querySelector('.result-display');
        resultDisplay.innerHTML = `<div class="loader"></div>`;
        try {
            const response = await fetch('/api/analyze-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: imageBase64 })
            });
            if (!response.ok) throw new Error('API error');
            const apiResult = await response.json();
            if (Array.isArray(apiResult) && apiResult.length > 0) {
                stopCamera();
                displayMultiResults(apiResult, mealType);
            } else if (apiResult.error) {
                resultDisplay.innerHTML = `<p>${apiResult.error}</p>`;
            } else {
                resultDisplay.innerHTML = `<p>No food detected. Try another image.</p>`;
            }
        } catch (err) {
            console.error('Error analyzing image:', err);
            resultDisplay.innerHTML = `<p>An error occurred. Please try again.</p>`;
        }
    }
    
    async function refineImage(correctionText, mealType) {
        const resultDisplay = mealEntryContent.querySelector('.result-display');
        resultDisplay.innerHTML = `<div class="loader"></div>`;
        try {
            const response = await fetch('/api/refine-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: currentImageBase64, correction: correctionText }),
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            if (data.error) {
                resultDisplay.innerHTML = `<p>${data.error}</p>`;
            } else {
                displayMultiResults(data, mealType);
            }
        } catch (err) {
            console.error('Error refining image:', err);
            resultDisplay.innerHTML = `<p>An error occurred during refinement.</p>`;
        }
    }

    function displayMultiResults(items, mealType) {
        const resultDisplay = mealEntryContent.querySelector('.result-display');
        let cardsHTML = items.map((item, index) => {
            const nutrients = item.nutrients || {};
            return `
            <div class="food-card" data-index="${index}">
                <button class="food-card-remove-btn">&times;</button>
                <h3 class="food-title">${item.foodName}</h3>
                <div class="portion-input-group">
                    <input type="number" class="portion-input" value="${item.unit === 'pcs' ? 1 : item.portionGrams ?? 100}">
                    <select class="unit-select">
                        <option value="g" ${item.unit === 'g' ? 'selected' : ''}>g</option>
                        <option value="ml" ${item.unit === 'ml' ? 'selected' : ''}>ml</option>
                        <option value="oz" ${item.unit === 'oz' ? 'selected' : ''}>oz</option>
                        ${item.gramsPerPiece ? `<option value="pcs" ${item.unit === 'pcs' ? 'selected' : ''}>pcs</option>` : ''}
                    </select>
                </div>
                <div class="macros">
                    <div class="macro-item"><i data-lucide="flame"></i><div class="macro-item-text"><div class="label">Calories</div><div class="value res-calories">${nutrients.calories ?? '-'} kcal</div></div></div>
                    <div class="macro-item"><i data-lucide="beef"></i><div class="macro-item-text"><div class="label">Protein</div><div class="value res-protein">${nutrients.proteinGrams ?? '-'}g</div></div></div>
                    <div class="macro-item"><i data-lucide="croissant"></i><div class="macro-item-text"><div class="label">Carbs</div><div class="value res-carbs">${nutrients.carbsGrams ?? '-'}g</div></div></div>
                    <div class="macro-item"><i data-lucide="egg-fried"></i><div class="macro-item-text"><div class="label">Fat</div><div class="value res-fat">${nutrients.fatGrams ?? '-'}g</div></div></div>
                </div>
                <button class="add-item-btn"><i data-lucide="plus-circle"></i> Add This Item</button>
            </div>`;
        }).join('');

        resultDisplay.innerHTML = cardsHTML;
        if (window.lucide?.createIcons) lucide.createIcons();

        resultDisplay.querySelectorAll('.food-card').forEach((card, index) => {
            const originalData = items[index];
            const portionInput = card.querySelector('.portion-input');
            const unitSelect = card.querySelector('.unit-select');
            const updateHandler = () => updateMacrosOnPortionChange(portionInput.value, unitSelect.value, originalData, card);
            portionInput.addEventListener('input', updateHandler);
            unitSelect.addEventListener('change', updateHandler);

            card.querySelector('.add-item-btn').addEventListener('click', () => {
                const { calories, protein, carbs, fat } = calculateFinalMacros(portionInput.value, unitSelect.value, originalData);
                addFoodToMeal(mealType, {
                    id: Date.now() + Math.random(), name: originalData.foodName, portion: parseFloat(portionInput.value), unit: unitSelect.value, gramsPerPiece: originalData.gramsPerPiece,
                    nutrientsPerGram: {
                        calories: (originalData.nutrients.calories || 0) / (originalData.portionGrams || 1),
                        protein: (originalData.nutrients.proteinGrams || 0) / (originalData.portionGrams || 1),
                        carbs: (originalData.nutrients.carbsGrams || 0) / (originalData.portionGrams || 1),
                        fat: (originalData.nutrients.fatGrams || 0) / (originalData.portionGrams || 1)
                    },
                    nutrients: { calories, protein, carbs, fat }
                });
                card.style.display = 'none';
                const remainingVisibleCards = resultDisplay.querySelector('.food-card:not([style*="display: none"])');
                if (!remainingVisibleCards) closeInputContainer();
            });
            card.querySelector('.food-card-remove-btn').addEventListener('click', () => card.remove());
        });
    }

    function calculateFinalMacros(quantity, unit, originalData) {
        const numQuantity = parseFloat(quantity) || 0;
        const originalNutrients = originalData.nutrients || {};
        let totalGrams = numQuantity;
        if (unit === 'pcs' && originalData.gramsPerPiece) totalGrams = numQuantity * originalData.gramsPerPiece;
        else if (unit === 'oz') totalGrams = numQuantity * 28.35;
        const base = originalData.portionGrams || 1;
        const scale = base ? (totalGrams / base) : 0;
        return {
            calories: Math.round((originalData.nutrients.calories || 0) * scale),
            protein: Math.round((originalData.nutrients.proteinGrams || 0) * scale),
            carbs: Math.round((originalData.nutrients.carbsGrams || 0) * scale),
            fat: Math.round((originalData.nutrients.fatGrams || 0) * scale)
        };
    }

    function updateMacrosOnPortionChange(quantity, unit, originalData, card) {
        const { calories, protein, carbs, fat } = calculateFinalMacros(quantity, unit, originalData);
        card.querySelector('.res-calories').textContent = `${calories} kcal`;
        card.querySelector('.res-protein').textContent = `${protein}g`;
        card.querySelector('.res-carbs').textContent = `${carbs}g`;
        card.querySelector('.res-fat').textContent = `${fat}g`;
    }

    function addFoodToMeal(mealType, foodItem) {
        dailyData.meals[mealType].push(foodItem);
        recalculateTotals();
        saveDailyData();
        renderAllMeals();
        updateDashboard();
        initializeEventListeners(); // Re-initialize listeners after meal is added
    }

    function deleteItem(mealType, itemId) {
        dailyData.meals[mealType] = dailyData.meals[mealType].filter(item => item.id !== itemId);
        recalculateTotals();
        saveDailyData();
        renderAllMeals();
        updateDashboard();
        initializeEventListeners(); // Re-initialize listeners after meal is deleted
    }

    function recalculateTotals() {
        dailyData.totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
        for (const mealType in dailyData.meals) {
            dailyData.meals[mealType].forEach(item => {
                const nutrients = item.nutrients || {};
                dailyData.totals.calories += nutrients.calories || 0;
                dailyData.totals.protein += nutrients.protein || 0;
                dailyData.totals.carbs += nutrients.carbs || 0;
                dailyData.totals.fat += nutrients.fat || 0;
            });
        }
    }
    
    function updateDashboard() {
        totalCaloriesEl.textContent = dailyData.totals.calories;
        totalProteinEl.textContent = dailyData.totals.protein;
        calorieGoalDisplay.textContent = dailyData.goals.calories;
        proteinGoalDisplay.textContent = dailyData.goals.protein;
        updateProgressRing(calorieRing, dailyData.totals.calories, dailyData.goals.calories);
        updateProgressRing(proteinRing, dailyData.totals.protein, dailyData.goals.protein);
    }

    function updateProgressRing(ringElement, current, goal) {
        const radius = ringElement.r.baseVal.value;
        const circumference = 2 * Math.PI * radius;
        let progress = goal > 0 ? current / goal : 0;
        if (progress > 1) progress = 1;
        const offset = circumference - progress * circumference;
        ringElement.style.strokeDashoffset = isNaN(offset) ? circumference : offset;
    }
    
    function updateGoals() {
        dailyData.goals.calories = parseInt(calorieGoalInput.value) || 0;
        dailyData.goals.protein = parseInt(proteinGoalInput.value) || 0;
        saveDailyData();
        updateDashboard();
        goalModal.classList.add('hidden');
    }
    
    function renderAllMeals() {
        for (const mealType in dailyData.meals) {
            const listEl = document.getElementById(`${mealType}-list`);
            const caloriesEl = document.getElementById(`${mealType}-calories`);
            let mealCalories = 0;
            if (dailyData.meals[mealType].length === 0) {
                listEl.innerHTML = `<p style="text-align:center; color: var(--subtle-text-color); padding: 1rem 0;">No items logged yet.</p>`;
            } else {
                listEl.innerHTML = '';
                dailyData.meals[mealType].forEach(item => {
                    const li = document.createElement('li');
                    const nutrients = item.nutrients || {};
                    mealCalories += nutrients.calories || 0;
                    li.innerHTML = `
                        <div class="meal-item-view">
                            <div class="meal-item-info">
                                <span class="meal-item-name">${item.name}</span>
                                <span class="meal-item-details">${item.portion}${item.unit} &bull; P:${nutrients.protein}g C:${nutrients.carbs}g F:${nutrients.fat}g</span>
                            </div>
                            <div class="meal-item-actions">
                                <span class="meal-item-calories">${nutrients.calories} kcal</span>
                                <button class="meal-item-delete" title="Delete item">&times;</button>
                            </div>
                        </div>
                        <div class="edit-dropdown hidden">
                            <input type="number" value="${item.portion}" class="edit-quantity"/>
                            <select class="edit-unit">
                                <option value="g" ${item.unit === 'g' ? 'selected' : ''}>g</option>
                                <option value="ml" ${item.unit === 'ml' ? 'selected' : ''}>ml</option>
                                <option value="oz" ${item.unit === 'oz' ? 'selected' : ''}>oz</option>
                                ${item.gramsPerPiece ? `<option value="pcs" ${item.unit === 'pcs' ? 'selected' : ''}>pcs</option>` : ''}
                            </select>
                        </div>
                    `;
                    
                    li.querySelector('.meal-item-info').addEventListener('click', () => {
                        li.querySelector('.edit-dropdown').classList.toggle('hidden');
                    });
                    
                    const editQuantityInput = li.querySelector('.edit-quantity');
                    const editUnitSelect = li.querySelector('.edit-unit');
                    const updateItemHandler = () => {
                        const newQuantity = parseFloat(editQuantityInput.value);
                        const newUnit = editUnitSelect.value;
                        updateItem(mealType, item.id, newQuantity, newUnit);
                    };
                    editQuantityInput.addEventListener('change', updateItemHandler);
                    editUnitSelect.addEventListener('change', updateItemHandler);

                    li.querySelector('.meal-item-delete').addEventListener('click', (e) => {
                        e.stopPropagation();
                        deleteItem(mealType, item.id);
                    });
                    listEl.appendChild(li);
                });
            }
            caloriesEl.textContent = `${mealCalories} kcal`;
        }
        if (window.lucide?.createIcons) {
            lucide.createIcons();
        }
    }

    function updateItem(mealType, itemId, newQuantity, newUnit) {
        const itemIndex = dailyData.meals[mealType].findIndex(i => i.id === itemId);
        if (itemIndex === -1) return;
        const item = dailyData.meals[mealType][itemIndex];
        item.portion = newQuantity;
        item.unit = newUnit;
        let totalGrams = newQuantity;
        if (newUnit === 'pcs' && item.gramsPerPiece) totalGrams = newQuantity * item.gramsPerPiece;
        else if (newUnit === 'oz') totalGrams = newQuantity * 28.35;
        item.nutrients.calories = Math.round(item.nutrientsPerGram.calories * totalGrams);
        item.nutrients.protein = Math.round(item.nutrientsPerGram.protein * totalGrams);
        item.nutrients.carbs = Math.round(item.nutrientsPerGram.carbs * totalGrams);
        item.nutrients.fat = Math.round(item.nutrientsPerGram.fat * totalGrams);
        recalculateTotals();
        saveDailyData();
        renderAllMeals();
        updateDashboard();
    }
    
    function saveDailyData() {
        localStorage.setItem('calorieTrackerData', JSON.stringify(dailyData));
    }
    
    function loadDailyData() {
        const savedData = localStorage.getItem('calorieTrackerData');
        if (savedData) {
            const parsedData = JSON.parse(savedData);
            if (parsedData.date === new Date().toLocaleDateString()) {
                dailyData = { ...dailyData, ...parsedData };
            }
        }
        saveDailyData();
    }
});