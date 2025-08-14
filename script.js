let selectedFile = null;

// Initialize drag and drop functionality
document.addEventListener('DOMContentLoaded', function() {
    const uploadSection = document.getElementById('uploadSection');
    const fileInput = document.getElementById('fileInput');

    // Drag and drop events
    uploadSection.addEventListener('dragover', handleDragOver);
    uploadSection.addEventListener('dragenter', handleDragEnter);
    uploadSection.addEventListener('dragleave', handleDragLeave);
    uploadSection.addEventListener('drop', handleDrop);
    
    // File input change event
    fileInput.addEventListener('change', handleFileSelect);

    // Click to upload
    uploadSection.addEventListener('click', () => fileInput.click());
});

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('uploadSection').classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget)) {
        document.getElementById('uploadSection').classList.remove('dragover');
    }
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('uploadSection').classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileSelect({ target: { files: files } });
    }
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
        showError('Please select a PDF, PNG, JPG, or JPEG file.');
        return;
    }

    // Validate file size (max 20MB)
    if (file.size > 20 * 1024 * 1024) {
        showError('File size must be less than 20MB.');
        return;
    }

    selectedFile = file;
    showFilePreview(file);
    document.getElementById('analyzeButton').style.display = 'block';
    hideError();
}

function showFilePreview(file) {
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatFileSize(file.size);
    document.getElementById('filePreview').style.display = 'block';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function analyzeDocument() {
    if (!selectedFile) {
        showError('Please select a file first.');
        return;
    }

    // Check if Azure credentials are configured
    if (AZURE_CONFIG.endpoint === 'YOUR_DOCUMENT_INTELLIGENCE_ENDPOINT' || 
        AZURE_CONFIG.apiKey === 'YOUR_DOCUMENT_INTELLIGENCE_KEY') {
        showError('Please configure your Azure credentials in the config.js file first.');
        return;
    }

    showLoading();
    hideError();
    hideResults();

    try {
        // Convert file to base64 for API call
        const base64Data = await fileToBase64(selectedFile);
        
        // Call Azure Document Intelligence API
        const analysisResult = await callDocumentIntelligence(base64Data);
        
        // Display results
        displayResults(analysisResult);
        
    } catch (error) {
        console.error('Error analyzing document:', error);
        showError('Failed to analyze document: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            // Remove the data:image/png;base64, or data:application/pdf;base64, prefix
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = error => reject(error);
    });
}

async function callDocumentIntelligence(base64Data) {
    const url = `${AZURE_CONFIG.endpoint}/formrecognizer/documentModels/prebuilt-document:analyze?api-version=2023-07-31`;
    
    // Convert base64 to binary
    const binaryData = atob(base64Data);
    const bytes = new Uint8Array(binaryData.length);
    for (let i = 0; i < binaryData.length; i++) {
        bytes[i] = binaryData.charCodeAt(i);
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/octet-stream',
            'Ocp-Apim-Subscription-Key': AZURE_CONFIG.apiKey
        },
        body: bytes
    });

    if (!response.ok) {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    // Get the operation location from response headers
    const operationLocation = response.headers.get('Operation-Location');
    if (!operationLocation) {
        throw new Error('No operation location returned from API');
    }

    // Poll for results
    return await pollForResults(operationLocation);
}

async function pollForResults(operationLocation) {
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
        const response = await fetch(operationLocation, {
            method: 'GET',
            headers: {
                'Ocp-Apim-Subscription-Key': AZURE_CONFIG.apiKey
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to get results: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.status === 'succeeded') {
            return result.analyzeResult;
        } else if (result.status === 'failed') {
            throw new Error('Document analysis failed');
        }

        // Wait 2 seconds before next attempt
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
    }

    throw new Error('Analysis timed out');
}

function displayResults(analyzeResult) {
    const extractedDataDiv = document.getElementById('extractedData');
    extractedDataDiv.innerHTML = '';

    // Display key-value pairs
    if (analyzeResult.keyValuePairs && analyzeResult.keyValuePairs.length > 0) {
        const kvSection = document.createElement('div');
        kvSection.className = 'result-section';
        kvSection.innerHTML = '<h3>📋 Key Information</h3>';

        analyzeResult.keyValuePairs.forEach(kv => {
            if (kv.key && kv.value) {
                const pair = document.createElement('div');
                pair.className = 'key-value-pair';
                pair.innerHTML = `
                    <span class="key">${kv.key.content || 'Unknown'}</span>
                    <span class="value">${kv.value.content || 'N/A'}</span>
                `;
                kvSection.appendChild(pair);
            }
        });

        extractedDataDiv.appendChild(kvSection);
    }

    // Display all extracted text
    if (analyzeResult.content) {
        const textSection = document.createElement('div');
        textSection.className = 'result-section';
        textSection.innerHTML = `
            <h3>📄 Full Document Text</h3>
            <div style="background: white; padding: 15px; border-radius: 5px; font-family: monospace; white-space: pre-wrap; max-height: 300px; overflow-y: auto;">
                ${analyzeResult.content}
            </div>
        `;
        extractedDataDiv.appendChild(textSection);
    }

    document.getElementById('results').style.display = 'block';
}

function showLoading() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('analyzeButton').disabled = true;
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('analyzeButton').disabled = false;
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}

function hideResults() {
    document.getElementById('results').style.display = 'none';
}