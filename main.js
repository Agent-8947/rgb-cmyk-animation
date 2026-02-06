import GIF from 'gif.js';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

const canvas = document.getElementById('main-canvas');
const ctx = canvas.getContext('2d');
const inputA = document.getElementById('input-a');
const inputB = document.getElementById('input-b');
const dropZoneA = document.getElementById('drop-zone-a');
const dropZoneB = document.getElementById('drop-zone-b');
const exportBtn = document.getElementById('export-gif');
const exportMp4Btn = document.getElementById('export-mp4');
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const emptyState = document.querySelector('.empty-state');

const dividerPreset = document.getElementById('divider-preset');
const dividerStyle = document.getElementById('divider-style');
const dividerWidth = document.getElementById('divider-width');
const handleSizeCtrl = document.getElementById('handle-size');
const speedRange = document.getElementById('speed-range');

const labelFontSizeCtrl = document.getElementById('label-font-size');
const labelFontFamilyCtrl = document.getElementById('label-font-family');
const labelBgColorCtrl = document.getElementById('label-bg-color');
const labelTextColorCtrl = document.getElementById('label-text-color');
const handleStyleCtrl = document.getElementById('handle-style');
const labelBgOpacityCtrl = document.getElementById('label-bg-opacity');
const labelBorderRadiusCtrl = document.getElementById('label-border-radius');
const dividerColorCtrl = document.getElementById('divider-color');
const handleColorCtrl = document.getElementById('handle-color');
const labelVPositionCtrl = document.getElementById('label-v-position');

let imgA = null;
let imgB = null;
let sliderPos = 0.5;
let isAnimating = true;
let animationDir = 1;
let animationPhase = 0;
let lastTime = 0;
let isExporting = false;
let isDragging = false;
let handlePos = { x: 0, y: 0 };

function init() {
    setupEventListeners();
    requestAnimationFrame(renderLoop);
}

function setupEventListeners() {
    [dividerPreset, dividerStyle, dividerWidth, handleSizeCtrl, labelFontSizeCtrl, labelFontFamilyCtrl, labelBgColorCtrl, labelTextColorCtrl, handleStyleCtrl, labelBgOpacityCtrl, labelBorderRadiusCtrl, labelVPositionCtrl, dividerColorCtrl, handleColorCtrl]
        .forEach(el => el.addEventListener('input', () => draw()));

    [dividerPreset, dividerStyle, labelFontFamilyCtrl, handleStyleCtrl, labelVPositionCtrl].forEach(el => el.addEventListener('change', () => draw()));

    [dropZoneA, dropZoneB].forEach((zone, index) => {
        const input = index === 0 ? inputA : inputB;
        zone.addEventListener('click', () => input.click());
        zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('active'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('active'));
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('active');
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file, index);
        });
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleFile(file, index);
        });
    });

    const handleMove = (e) => {
        if (!imgA || !imgB || isExporting) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const preset = dividerPreset.value;
        if (preset === 'vertical' || preset === 'spotlight' || preset === 'diagonal') {
            sliderPos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        } else if (preset === 'horizontal') {
            sliderPos = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
        }
    };

    canvas.addEventListener('mousedown', (e) => { isDragging = true; handleMove(e); });
    window.addEventListener('mousemove', (e) => { if (isDragging) handleMove(e); });
    window.addEventListener('mouseup', () => { isDragging = false; });
    canvas.addEventListener('touchstart', (e) => { isDragging = true; handleMove(e); });
    window.addEventListener('touchmove', (e) => { if (isDragging) handleMove(e); });
    window.addEventListener('touchend', () => { isDragging = false; });

    exportBtn.addEventListener('click', startGifExport);
    exportMp4Btn.addEventListener('click', startMp4Export);
}

function handleFile(file, index) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            if (index === 0) {
                imgA = img;
                document.getElementById('preview-a').style.backgroundImage = `url(${e.target.result})`;
                dropZoneA.classList.add('loaded');
                updateCanvasSize();
            } else {
                imgB = img;
                document.getElementById('preview-b').style.backgroundImage = `url(${e.target.result})`;
                dropZoneB.classList.add('loaded');
            }
            if (imgA && imgB) {
                exportBtn.disabled = false;
                exportMp4Btn.disabled = !window.VideoEncoder;
                if (!window.VideoEncoder) exportMp4Btn.title = "MP4 Export requires a modern browser (Chrome/Edge/Safari)";
                emptyState.style.display = 'none';
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function updateCanvasSize() {
    if (!imgA) return;
    const maxWidth = 1920;
    const scale = Math.min(1, maxWidth / imgA.width);
    canvas.width = imgA.width * scale;
    canvas.height = imgA.height * scale;
    draw();
}

function renderLoop(time) {
    const deltaTime = (time - lastTime) / 1000;
    lastTime = time;
    if (isAnimating && !isExporting) updateAnimation(deltaTime);
    draw();
    requestAnimationFrame(renderLoop);
}

function updateAnimation(deltaTime) {
    if (isDragging) return;
    const speed = parseFloat(speedRange.value);
    animationPhase += deltaTime / speed;
    sliderPos = (Math.sin(animationPhase * Math.PI - Math.PI / 2) + 1) / 2;
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!imgA || !imgB) return;

    const preset = dividerPreset.value;
    const style = dividerStyle.value;
    const width = parseInt(dividerWidth.value);
    const hSize = parseInt(handleSizeCtrl.value);

    // Draw Image B (Bottom layer)
    ctx.drawImage(imgB, 0, 0, canvas.width, canvas.height);

    // Prepare clipping area for Image A and Labels
    ctx.save();
    ctx.beginPath();
    let lineStart = { x: 0, y: 0 }, lineEnd = { x: 0, y: 0 };
    handlePos = { x: 0, y: 0 };

    if (preset === 'vertical') {
        const x = canvas.width * sliderPos;
        ctx.rect(0, 0, x, canvas.height);
        lineStart = { x, y: 0 }; lineEnd = { x, y: canvas.height };
        handlePos = { x, y: canvas.height / 2 };
    } else if (preset === 'horizontal') {
        const y = canvas.height * sliderPos;
        ctx.rect(0, 0, canvas.width, y);
        lineStart = { x: 0, y }; lineEnd = { x: canvas.width, y };
        handlePos = { x: canvas.width / 2, y };
    } else if (preset === 'diagonal') {
        ctx.moveTo(0, 0);
        const splitPoint = (canvas.width + canvas.height) * sliderPos;
        ctx.lineTo(Math.min(splitPoint, canvas.width), 0);
        if (splitPoint > canvas.width) ctx.lineTo(canvas.width, splitPoint - canvas.width);
        ctx.lineTo(0, Math.min(splitPoint, canvas.height));
        ctx.closePath();
        const dx = Math.min(splitPoint, canvas.width);
        const dy = Math.min(splitPoint, canvas.height);
        handlePos = { x: dx / 2, y: dy / 2 };
        lineStart = { x: dx, y: splitPoint > canvas.width ? splitPoint - canvas.width : 0 };
        lineEnd = { x: splitPoint > canvas.height ? splitPoint - canvas.height : 0, y: dy };
    } else if (preset === 'spotlight') {
        const x = canvas.width * sliderPos;
        const radius = Math.min(canvas.width, canvas.height) * 0.25;
        const y = canvas.height / 2;
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        handlePos = { x, y };
    }

    // --- STEP 1: Draw Image A (Clipped)
    ctx.save();
    ctx.clip();
    ctx.drawImage(imgA, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // --- STEP 2: Draw Labels (Affected by Clipping / Eraser Effect)
    const fSize = parseInt(labelFontSizeCtrl.value);
    const fFamily = labelFontFamilyCtrl.value;
    const bgColor = labelBgColorCtrl.value;
    const textColor = labelTextColorCtrl.value;
    const bgOpacity = parseFloat(labelBgOpacityCtrl.value);
    const bRadius = parseInt(labelBorderRadiusCtrl.value);
    const vPos = labelVPositionCtrl.value;

    const drawSideLabel = (text, x, y, align) => {
        ctx.save();

        // Vertical Positioning
        let finalY = y;
        if (vPos === 'top') finalY = 60;
        else if (vPos === 'bottom') finalY = canvas.height - 60;

        ctx.font = `bold ${fSize}px ${fFamily}`;
        const metrics = ctx.measureText(text);
        const paddingH = fSize;
        const rectW = metrics.width + paddingH * 2;
        const rectH = fSize * 2;
        const rectX = align === 'right' ? x - rectW : x;
        const rectY = finalY - rectH / 2;

        ctx.globalAlpha = bgOpacity;
        ctx.fillStyle = bgColor;
        ctx.beginPath();
        ctx.roundRect(rectX, rectY, rectW, rectH, bRadius);
        ctx.fill();

        ctx.globalAlpha = 1.0;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, rectX + rectW / 2, finalY);
        ctx.restore();
    };

    // To create the "eraser" effect where label stays with its image:
    // We draw RGB always clipped to A's area
    // We draw CMYK always clipped to B's area (which is the inverse of A's area)

    // Draw RGB (Fixed on Left, only visible in A's area)
    ctx.save();
    ctx.clip();
    drawSideLabel('RGB', 60, canvas.height / 2, 'left', false);
    ctx.restore();

    // Draw CMYK (Fixed on Right, visible everywhere EXCEPT A's area)
    ctx.save();
    // Create inverse clip
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    if (preset === 'vertical') {
        const x = canvas.width * sliderPos;
        ctx.rect(x, 0, -x, canvas.height); // This doesn't really work simple way
    }
    // Faster way: Draw CMYK normally, then Image A on top (already done), 
    // BUT we want labels to be clipped too.
    ctx.restore();

    // REDO DRAW LOGIC FOR "ERASER" EFFECT:
    // 1. Draw Image B
    // 2. Draw CMYK label
    // 3. Clip
    // 4. Draw Image A
    // 5. Draw RGB label
    // 6. Restore
    // 7. Draw Divider on top
    ctx.restore(); // Clear initial path

    // Final Correct Order:
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Default: Image B is background, Image A is overlay
    let bgImg = imgB;
    let overlayImg = imgA;
    let bgLabel = 'CMYK';
    let overlayLabel = 'RGB';
    let bgAlign = 'right';
    let overlayAlign = 'left';

    // In Spotlight/Diagonal, user expects the revealed part to be CMYK for color check
    // or vice versa depending on logic. Let's fix the specific visual mismatch.
    if (preset === 'spotlight' || preset === 'diagonal') {
        bgImg = imgA;
        overlayImg = imgB;
        bgLabel = 'RGB';
        overlayLabel = 'CMYK';
        bgAlign = 'left';
        overlayAlign = 'right';
    }

    ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
    drawSideLabel(bgLabel, canvas.width - 60, canvas.height / 2, 'right');

    ctx.save();
    // Re-apply path
    ctx.beginPath();
    if (preset === 'vertical') ctx.rect(0, 0, canvas.width * sliderPos, canvas.height);
    else if (preset === 'horizontal') ctx.rect(0, 0, canvas.width, canvas.height * sliderPos);
    else if (preset === 'diagonal') {
        const splitPoint = (canvas.width + canvas.height) * sliderPos;
        ctx.moveTo(0, 0); ctx.lineTo(Math.min(splitPoint, canvas.width), 0);
        if (splitPoint > canvas.width) ctx.lineTo(canvas.width, splitPoint - canvas.width);
        ctx.lineTo(0, Math.min(splitPoint, canvas.height)); ctx.closePath();
    } else if (preset === 'spotlight') {
        ctx.arc(canvas.width * sliderPos, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.25, 0, Math.PI * 2);
    }
    ctx.clip();
    ctx.drawImage(overlayImg, 0, 0, canvas.width, canvas.height);
    drawSideLabel(overlayLabel, 60, canvas.height / 2, 'left');
    ctx.restore();

    // --- STEP 3: Divider UI (Always on Top)
    if (style !== 'none') {
        const dColor = dividerColorCtrl.value;
        ctx.save();
        if (style === 'neon') {
            ctx.shadowBlur = width * 2;
            ctx.shadowColor = dColor;
            ctx.strokeStyle = dColor;
        } else if (style === 'minimal' || style === 'dashed' || style === 'dotted' || style === 'double') {
            ctx.strokeStyle = dColor;
            if (style === 'dashed') ctx.setLineDash([10, 10]);
            if (style === 'dotted') ctx.setLineDash([3, 6]);
        }
        ctx.lineWidth = width;
        ctx.beginPath();
        if (preset === 'spotlight') {
            ctx.arc(handlePos.x, handlePos.y, Math.min(canvas.width, canvas.height) * 0.25, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            if (style === 'double') {
                const offset = width * 1.5;
                const angle = Math.atan2(lineEnd.y - lineStart.y, lineEnd.x - lineStart.x);
                const dx = Math.sin(angle) * offset;
                const dy = -Math.cos(angle) * offset;

                ctx.moveTo(lineStart.x - dx, lineStart.y - dy); ctx.lineTo(lineEnd.x - dx, lineEnd.y - dy);
                ctx.moveTo(lineStart.x + dx, lineStart.y + dy); ctx.lineTo(lineEnd.x + dx, lineEnd.y + dy);
            } else {
                ctx.moveTo(lineStart.x, lineStart.y);
                ctx.lineTo(lineEnd.x, lineEnd.y);
            }
            ctx.stroke();
        }
        ctx.restore();
    }

    // Handle
    const hStyle = handleStyleCtrl.value;
    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.beginPath();

    if (hStyle === 'circle') {
        ctx.arc(handlePos.x, handlePos.y, hSize, 0, Math.PI * 2);
        ctx.fillStyle = handleColorCtrl.value;
        ctx.fill();
    } else if (hStyle === 'ring') {
        ctx.arc(handlePos.x, handlePos.y, hSize, 0, Math.PI * 2);
        ctx.strokeStyle = handleColorCtrl.value;
        ctx.lineWidth = 4;
        ctx.stroke();
    } else if (hStyle === 'square') {
        ctx.roundRect(handlePos.x - hSize, handlePos.y - hSize, hSize * 2, hSize * 2, 8);
        ctx.fillStyle = handleColorCtrl.value;
        ctx.fill();
    } else if (hStyle === 'minimal') {
        const thickness = Math.max(2, hSize / 8);
        ctx.rect(handlePos.x - thickness / 2, handlePos.y - hSize, thickness, hSize * 2);
        ctx.rect(handlePos.x - hSize, handlePos.y - thickness / 2, hSize * 2, thickness);
        ctx.fillStyle = handleColorCtrl.value;
        ctx.fill();
    } else if (hStyle === 'dot') {
        ctx.arc(handlePos.x, handlePos.y, hSize * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = handleColorCtrl.value;
        ctx.fill();
    } else if (hStyle === 'pill') {
        const rx = preset === 'horizontal' ? hSize * 1.5 : hSize * 0.5;
        const ry = preset === 'horizontal' ? hSize * 0.5 : hSize * 1.5;
        ctx.roundRect(handlePos.x - rx, handlePos.y - ry, rx * 2, ry * 2, Math.min(rx, ry));
        ctx.fillStyle = handleColorCtrl.value;
        ctx.fill();
    } else if (hStyle === 'brackets') {
        const bWidth = hSize * 0.8;
        const bHeight = hSize * 1.2;
        const bThick = Math.max(2, hSize / 6);
        ctx.rect(handlePos.x - bWidth, handlePos.y - bHeight / 2, bThick, bHeight);
        ctx.rect(handlePos.x + bWidth - bThick, handlePos.y - bHeight / 2, bThick, bHeight);
        ctx.fillStyle = handleColorCtrl.value;
        ctx.fill();
    }

    // Arrows/Text for non-minimal styles
    if (hStyle !== 'minimal' && hStyle !== 'ring') {
        ctx.shadowBlur = 0; // Don't shadow the text
        // Use handle color for 'arrows' style, dark color otherwise
        ctx.fillStyle = (hStyle === 'arrows' || hStyle === 'brackets') ? handleColorCtrl.value : '#1a1a24';
        ctx.font = `bold ${Math.round(hSize * 0.7)}px ${labelFontFamilyCtrl.value}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const arrow = (preset === 'horizontal') ? '▲▼' : '◄ ►';
        ctx.fillText(arrow, handlePos.x, handlePos.y);
    }

    ctx.restore();
}

async function startGifExport() {
    if (isExporting) return;
    isExporting = true;
    exportBtn.disabled = true;
    exportMp4Btn.disabled = true;
    progressContainer.classList.remove('hidden');
    updateProgress(0, 'Initializing GIF Engine...');
    const gif = new GIF({ workers: 2, quality: 10, workerScript: '/gif.worker.js', width: canvas.width, height: canvas.height });
    const cycleSec = 2.0;
    const fps = 20;
    const totalFrames = fps * cycleSec * 2;
    const frameDelay = (cycleSec * 2 * 1000) / totalFrames;
    const originalPhase = animationPhase;
    const exportStartTime = performance.now();

    for (let i = 0; i <= totalFrames; i++) {
        animationPhase = (i / totalFrames) * 2 - 0.5;
        sliderPos = (Math.sin(animationPhase * Math.PI) + 1) / 2;
        draw();
        gif.addFrame(ctx, { copy: true, delay: frameDelay });

        // Time remaining estimate for capture phase
        const elapsed = (performance.now() - exportStartTime) / 1000;
        const progress = i / totalFrames;
        let timeRemainingStr = '';
        if (progress > 0.1) {
            const remaining = (elapsed / progress) - elapsed;
            timeRemainingStr = ` | ~${remaining.toFixed(1)}s left`;
        }

        updateProgress(
            Math.round(progress * 50),
            `GIF: Capturing frames (${i}/${totalFrames})${timeRemainingStr}`
        );
        await new Promise(r => setTimeout(r, 10));
    }
    updateProgress(50, 'GIF: Starting render...');
    gif.on('progress', (p) => updateProgress(50 + Math.round(p * 50), 'GIF: Processing images...'));
    gif.on('finished', (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `comparison_${Date.now()}.gif`;
        link.click();
        isExporting = false;
        exportBtn.disabled = false;
        progressContainer.classList.add('hidden');
        animationPhase = originalPhase;
        isAnimating = true;
    });
    gif.render();
}

function updateProgress(percent, text) {
    progressFill.style.width = `${percent}%`;
    progressText.textContent = `Progress: ${percent}% | ${text}`;
}


async function startMp4Export() {
    if (isExporting || !window.VideoEncoder) return;
    isExporting = true;
    exportMp4Btn.disabled = true;
    exportBtn.disabled = true;
    progressContainer.classList.remove('hidden');
    updateProgress(0, 'Initializing H.264 Encoder...');

    // MP4/H.264 requirements: even dimensions
    const width = canvas.width % 2 === 0 ? canvas.width : canvas.width - 1;
    const height = canvas.height % 2 === 0 ? canvas.height : canvas.height - 1;

    const config = {
        codec: 'avc1.4d002a', // Main Profile, Level 4.2 - High compatibility
        width: width,
        height: height,
        bitrate: 4_000_000,
    };

    try {
        const support = await VideoEncoder.isConfigSupported(config);
        if (!support.supported) {
            throw new Error("H.264 codec configuration not supported by this browser.");
        }

        let muxer = new Muxer({
            target: new ArrayBufferTarget(),
            video: {
                codec: 'avc',
                width: width,
                height: height
            },
            fastStart: 'in-memory'
        });

        let videoEncoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
            error: e => {
                updateProgress(0, `Encoder Error: ${e.message}`);
                console.error(e);
            }
        });

        videoEncoder.configure(config);

        const cycleSec = 2.0;
        const fps = 30;
        const totalFrames = fps * cycleSec * 2;
        const originalPhase = animationPhase;
        isAnimating = false;

        const exportStartTime = performance.now();

        for (let i = 0; i <= totalFrames; i++) {
            animationPhase = (i / totalFrames) * 2 - 0.5;
            sliderPos = (Math.sin(animationPhase * Math.PI) + 1) / 2;
            draw();

            // Bitmap for encoder
            const bitmap = await createImageBitmap(canvas, 0, 0, width, height);
            videoEncoder.encode(bitmap, { keyFrame: i % 30 === 0 });
            bitmap.close();

            // Calculate time remaining
            const elapsed = (performance.now() - exportStartTime) / 1000;
            const progress = i / totalFrames;
            let timeRemainingStr = '';

            if (progress > 0.05) { // Wait for a stable estimate
                const estimatedTotalTime = elapsed / progress;
                const remaining = Math.max(0, estimatedTotalTime - elapsed);
                timeRemainingStr = ` | ~${remaining.toFixed(1)}s left`;
            }

            updateProgress(
                Math.round(progress * 90),
                `H.264: Encoding (Frame ${i}/${totalFrames})${timeRemainingStr}`
            );

            // UI responsiveness
            if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
        }

        updateProgress(95, 'H.264: Finalizing container...');
        await videoEncoder.flush();
        muxer.finalize();

        const { buffer } = muxer.target;
        const blob = new Blob([buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `comparison_${Date.now()}.mp4`;
        link.click();

        updateProgress(100, 'Export complete!');
        setTimeout(() => {
            isExporting = false;
            exportBtn.disabled = false;
            exportMp4Btn.disabled = false;
            progressContainer.classList.add('hidden');
            animationPhase = originalPhase;
            isAnimating = true;
            draw();
        }, 1000);
    } catch (err) {
        updateProgress(0, `Export Failed: ${err.message}`);
        console.error("MP4 Export Error:", err);
        isExporting = false;
        exportBtn.disabled = false;
        exportMp4Btn.disabled = false;
    }
}

init();
