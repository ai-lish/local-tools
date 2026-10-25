
/* 獨立謝師恩文章工具：名單、批改、Word 範本及預覽。 */
var LIFE_EDU_STATE = {
  loaded:false, rows:[], savedRows:[], meta:{title:'箋紙濃情謝師恩 2026'}, selectedId:'',
  filter:'all', search:'', dirty:false, templateBytes:null, templateName:'',
  fontSize:16, cardTextWidthPct:37, cardTextHeightPct:46, importing:false, generating:false, teacherRevisionPrompt:'', teacherRevisionBusy:false, revisionChanges:[],
  pdfWorkspace:null, pdfPageView:'grid', pdfPageViewPage:1, pdfJsDocument:null, pdfJsDocumentPromise:null, pdfJsSourceFileId:'', pdfThumbObserver:null, pdfPageThumbCache:Object.create(null), pdfPageThumbUrls:Object.create(null), cardDesign:null, cardView:'content', cardDesignUrls:{}, pdfPageImageCache:Object.create(null), pdfPageImageUrls:Object.create(null), sourcePreviewUrls:[], scanImportLocks:Object.create(null), storageSnapshot:null, externalStorageChanged:false, storageListenerInstalled:false, crossTabWriteDepth:0
};
var LIFE_EDU_REVIEW_STATUSES = ['待收稿','待身份核對','待學生澄清','待老師覆核','已完成','豁免'];
var LIFE_EDU_WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
var LIFE_EDU_WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
var LIFE_EDU_LOCAL_KEY = 'local-tools.thank-teacher-cards.v1';
var LIFE_EDU_DB_NAME = 'local-tools-thank-teacher-cards';
var LIFE_EDU_DB_STORE = 'attachments';
var LIFE_EDU_MINIMAX_ENDPOINT = 'https://api.minimax.io/v1/chat/completions';
var LIFE_EDU_MINIMAX_MODEL = 'MiniMax-M3.1-Flash';

function lifeEduEsc_(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
}
function lifeEduClone_(value){return JSON.parse(JSON.stringify(value));}
function lifeEduToast_(message,error){
  var old=document.querySelector('.le-toast');if(old)old.remove();
  var node=document.createElement('div');node.className='le-toast'+(error?' error':'');node.setAttribute('role','status');node.textContent=message;
  document.body.appendChild(node);window.setTimeout(function(){node.remove();},4200);
}
function lifeEduStatus_(row){
  if(row.exempt||(row.expectedSheets!==''&&row.expectedSheets!=null&&Number(row.expectedSheets)===0))return '免交';
  if(row.expectedSheets===''||row.expectedSheets==null)return '待核張數';
  if(row.physicalReceived===''||row.physicalReceived==null)return '待點收';
  return Number(row.physicalReceived)>=Number(row.expectedSheets||0)?'已收齊':'欠'+Math.max(0,Number(row.expectedSheets||0)-Number(row.physicalReceived||0))+'張';
}
function lifeEduSubmissionStatus_(row){
  if(row.exempt||(row.expectedSheets!==''&&row.expectedSheets!=null&&Number(row.expectedSheets)===0))return '免交';
  if(row.expectedSheets===''||row.expectedSheets==null)return '待核張數';
  if(row.physicalReceived===''||row.physicalReceived==null)return '未完成遞交';
  var missing=Math.max(0,Number(row.expectedSheets||0)-Number(row.physicalReceived||0));
  return missing?'欠交 '+missing+' 張':'已完成遞交';
}
function lifeEduPill_(status){return status==='已收齊'||status==='已完成'||status==='免交'?'ok':(status.indexOf('欠')===0||status==='待學生澄清'||status==='待核張數'?'warn':'');}
function lifeEduSelected_(){return LIFE_EDU_STATE.rows.filter(function(r){return r.id===LIFE_EDU_STATE.selectedId;})[0]||LIFE_EDU_STATE.rows[0]||null;}
function lifeEduSourceUrl_(url){return /^https:\/\//i.test(String(url||''))?String(url):'';}

function lifeEduStart_(){
  try{
    if(!LIFE_EDU_STATE.storageListenerInstalled){window.addEventListener('storage',function(event){if(event.key===LIFE_EDU_LOCAL_KEY){LIFE_EDU_STATE.externalStorageChanged=true;lifeEduToast_('另一個分頁已更新本機記錄；請重新載入頁面後再繼續編輯。',true);}});LIFE_EDU_STATE.storageListenerInstalled=true;}
    var raw=localStorage.getItem(LIFE_EDU_LOCAL_KEY),saved=JSON.parse(raw||'null');LIFE_EDU_STATE.storageSnapshot=raw;LIFE_EDU_STATE.externalStorageChanged=false;
    if(saved&&saved.format==='life-edu-local-backup'&&[1,2,3].indexOf(saved.schemaVersion)>=0){
      lifeEduApplyBackup_(saved);
    }
  }catch(error){lifeEduShowError_('本機記錄無法讀取：'+(error.message||String(error)));return;}
  LIFE_EDU_STATE.savedRows=lifeEduClone_(LIFE_EDU_STATE.rows);LIFE_EDU_STATE.loaded=true;
  if(!LIFE_EDU_STATE.rows.some(function(r){return r.id===LIFE_EDU_STATE.selectedId;}))LIFE_EDU_STATE.selectedId=LIFE_EDU_STATE.rows[0]&&LIFE_EDU_STATE.rows[0].id||'';
  lifeEduRender_();
}
function lifeEduShowError_(message){
  var target=document.getElementById('leApp');target.innerHTML='<section class="le-panel le-editor"><div class="le-eyebrow">本機資料</div><h2>無法讀取謝師恩記錄</h2><p>'+lifeEduEsc_(message)+'</p><button class="le-button" type="button" data-le-reload>重新讀取</button></section>';
  var retry=target.querySelector('[data-le-reload]');if(retry)retry.addEventListener('click',lifeEduStart_);
}

function lifeEduLocalBackup_(){
  var templateBase64='';if(LIFE_EDU_STATE.templateBytes){var bytes=new Uint8Array(LIFE_EDU_STATE.templateBytes),chunk='';for(var i=0;i<bytes.length;i+=0x8000)chunk+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+0x8000,bytes.length)));templateBase64=btoa(chunk);}
  return {format:'life-edu-local-backup',schemaVersion:3,createdAt:new Date().toISOString(),rows:LIFE_EDU_STATE.rows,meta:LIFE_EDU_STATE.meta||{},fontSize:LIFE_EDU_STATE.fontSize,cardTextWidthPct:LIFE_EDU_STATE.cardTextWidthPct,cardTextHeightPct:LIFE_EDU_STATE.cardTextHeightPct,templateName:LIFE_EDU_STATE.templateName||'',templateBase64:templateBase64,pdfWorkspace:LIFE_EDU_STATE.pdfWorkspace?lifeEduClone_(LIFE_EDU_STATE.pdfWorkspace):null,cardDesign:LIFE_EDU_STATE.cardDesign?lifeEduClone_(LIFE_EDU_STATE.cardDesign):null};
}
function lifeEduCardLayoutPercent_(value,min,max,fallback){var number=typeof value==='number'&&Number.isInteger(value)?value:typeof value==='string'&&/^\d{1,2}$/.test(value.trim())?Number(value):NaN;return Number.isInteger(number)&&number>=min&&number<=max?number:fallback;}
function lifeEduValidateBackup_(backup){
  if(!backup||backup.format!=='life-edu-local-backup'||[1,2,3].indexOf(backup.schemaVersion)<0||!Array.isArray(backup.rows))throw new Error('這不是可還原的謝師恩 JSON 備份。');
  if(backup.rows.length>1000||backup.rows.some(function(row){return !row||typeof row!=='object'||Array.isArray(row);}))throw new Error('備份記錄數量或資料結構不正確。');
  var identities=Object.create(null);
  return backup.rows.map(function(raw){
    var row=lifeEduNormalizeImportRow_(raw),className=typeof row.className==='string'?row.className.trim():'';
    var rawNumber=row.classNumber,numberText=typeof rawNumber==='number'&&Number.isInteger(rawNumber)?String(rawNumber):typeof rawNumber==='string'?rawNumber.trim():'';
    if(!className||className.length>50||/[\u0000-\u001f\u007f]/.test(className)||!/^\d{1,3}$/.test(numberText)||Number(numberText)<1||Number(numberText)>999)throw new Error('備份內每名學生必須有有效班別和 1 至 999 的整數班號。');
    row.className=className;row.classNumber=Number(numberText);row.id=lifeEduStudentId_(className,row.classNumber);
    if(identities[row.id])throw new Error('備份內有重複的班別和班號：'+row.id+'。');identities[row.id]=true;
    var textFields=['studentNumber','nameZh','nameEn','gender','house','primarySchool','ocrStudentName','ocrTeacherName','ocrPrimarySchool','teacherName','teacherTitle','teacherNote','ocrNote','sourceUrl','sourceOcrText','verifiedOcrText','correctedText','updatedAt','updatedBy'];
    textFields.forEach(function(key){var value=row[key];if(value==null){row[key]='';return;}if(typeof value!=='string'&&typeof value!=='number'&&typeof value!=='boolean')throw new Error('備份內 '+key+' 必須是文字。');row[key]=String(value);if(row[key].length>(key==='sourceOcrText'||key==='verifiedOcrText'||key==='correctedText'?20000:2000))throw new Error('備份內 '+key+' 超出可接受長度。');});
    ['expectedSheets','physicalReceived','scannedSheets'].forEach(function(key){var value=row[key];if(value==null||value===''){row[key]='';return;}var rawValue=String(value).trim();if(!/^\d{1,2}$/.test(rawValue)||Number(rawValue)>20)throw new Error('備份內 '+key+' 必須是 0 至 20 的整數或留空。');row[key]=rawValue;});
    var rawVersions=raw.scanVersions;if(rawVersions!=null&&!Array.isArray(rawVersions))throw new Error('備份內掃描版本資料格式不正確。');var versions=Array.isArray(rawVersions)?rawVersions:[];if(versions.length>100)throw new Error('單名學生的掃描版本超出 100 份。');row.scanVersions=versions.map(function(item){if(!item||typeof item!=='object'||Array.isArray(item)||!/^lefile-[a-z0-9-]{8,80}$/i.test(String(item.id||'')))throw new Error('掃描版本識別碼格式不正確。');var rawSheets=item.sheets,sheets=rawSheets==null||rawSheets===''?1:typeof rawSheets==='number'?rawSheets:typeof rawSheets==='string'&&/^\d{1,2}$/.test(rawSheets.trim())?Number(rawSheets.trim()):NaN;if(!Number.isInteger(sheets)||sheets<1||sheets>20)throw new Error('備份內每個掃描版本必須是 1 至 20 的整數頁。');if(item.active!==undefined&&typeof item.active!=='boolean')throw new Error('備份內掃描版本狀態格式不正確。');return {id:String(item.id),kind:['初次收件','更新內容'].indexOf(item.kind)>=0?item.kind:'補交',fileName:String(item.fileName||'掃描.pdf').slice(0,240),mimeType:String(item.mimeType||'application/pdf').slice(0,120),size:Math.max(0,Number(item.size)||0),sheets:sheets,uploadedAt:String(item.uploadedAt||''),active:item.active!==false};});var activeSheets=row.scanVersions.filter(function(item){return item.active;}).reduce(function(sum,item){return sum+item.sheets;},0);if(activeSheets>20)throw new Error('備份內現行掃描總頁數不可超過 20 頁。');if(versions.length)row.scannedSheets=String(activeSheets);
    var pageRecords=Array.isArray(raw.articlePageRecords)?raw.articlePageRecords:[];if(pageRecords.length>100)throw new Error('單名學生的逐頁來源記錄超出 100 頁。');if(pageRecords.some(function(item){return item&&String(item.ocrText||'').length>2800;}))throw new Error('備份內有逐頁 OCR 超過 2,800 字；已停止還原，避免截掉文章。');row.articlePageRecords=pageRecords.map(function(item){return {attachmentId:String(item.attachmentId||'').slice(0,100),sourceFileName:String(item.sourceFileName||'').slice(0,240),pageNumber:Math.max(1,Number(item.pageNumber)||1),ocrText:String(item.ocrText||''),importedAt:String(item.importedAt||'').slice(0,50)};});
    if(LIFE_EDU_REVIEW_STATUSES.indexOf(row.reviewStatus)<0)row.reviewStatus='待身份核對';
    return row;
  });
}
function lifeEduApplyBackup_(backup){
  // Normalize and decode the entire backup before changing live state. A bad
  // late field must not leave a mixture of old and new rows/settings in memory.
  var rows=lifeEduValidateBackup_(backup);
  var meta=backup.meta&&typeof backup.meta==='object'?lifeEduClone_(backup.meta):{title:'箋紙濃情謝師恩 2026'};
  if(!Array.isArray(meta.classTeachers))meta.classTeachers=[];
  if(typeof meta.title!=='string')meta.title='箋紙濃情謝師恩 2026';
  var fontSize=Math.min(28,Math.max(12,Number(backup.fontSize)||16)),cardTextWidthPct=lifeEduCardLayoutPercent_(backup.cardTextWidthPct,25,40,37),cardTextHeightPct=lifeEduCardLayoutPercent_(backup.cardTextHeightPct,30,50,46);
  var pdfWorkspace=backup.pdfWorkspace&&typeof backup.pdfWorkspace==='object'?lifeEduNormalizePdfWorkspace_(backup.pdfWorkspace):null;
  var cardDesign=lifeEduNormalizeCardDesign_(backup.cardDesign);
  var templateName=String(backup.templateName||''),templateBytes=null;
  if(backup.templateBase64){var binary=atob(backup.templateBase64),bytes=new Uint8Array(binary.length);for(var i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);templateBytes=bytes.buffer;}
  lifeEduRevokeCardDesignUrls_();
  LIFE_EDU_STATE.rows=rows;LIFE_EDU_STATE.meta=meta;LIFE_EDU_STATE.fontSize=fontSize;LIFE_EDU_STATE.cardTextWidthPct=cardTextWidthPct;LIFE_EDU_STATE.cardTextHeightPct=cardTextHeightPct;
  LIFE_EDU_STATE.pdfWorkspace=pdfWorkspace;lifeEduInvalidatePdfRenderCache_();LIFE_EDU_STATE.pdfPageView='grid';LIFE_EDU_STATE.pdfPageViewPage=1;LIFE_EDU_STATE.cardDesign=cardDesign;LIFE_EDU_STATE.cardView='content';
  LIFE_EDU_STATE.templateBytes=templateBytes;LIFE_EDU_STATE.templateName=templateName;
}
function lifeEduNormalizeCardDesign_(raw){
  if(!raw||typeof raw!=='object')return null;
  function asset(value){if(!value||typeof value!=='object')return null;var id=String(value.id||'');if(!/^lefile-[a-z0-9-]{8,80}$/i.test(id))return null;var mime=String(value.mimeType||'image/jpeg');if(['image/jpeg','image/png','image/webp'].indexOf(mime)<0)return null;return {id:id,fileName:String(value.fileName||'色稿圖片').slice(0,240),mimeType:mime,size:Math.max(0,Number(value.size)||0)};}
  var result={cover:asset(raw.cover),content:asset(raw.content),updatedAt:String(raw.updatedAt||'').slice(0,50)};
  return result.cover||result.content?result:null;
}
function lifeEduRevokeCardDesignUrls_(){var urls=LIFE_EDU_STATE.cardDesignUrls||{};['cover','content'].forEach(function(side){var item=urls[side];if(item&&item.url)URL.revokeObjectURL(item.url);});LIFE_EDU_STATE.cardDesignUrls={};}
function lifeEduPersistLocalNow_(){
  try{
    if(LIFE_EDU_STATE.externalStorageChanged||localStorage.getItem(LIFE_EDU_LOCAL_KEY)!==LIFE_EDU_STATE.storageSnapshot){LIFE_EDU_STATE.externalStorageChanged=true;throw new Error('另一個分頁已更新本機記錄；請重新載入頁面後再保存，避免覆蓋最新內容。');}
    var serialized=JSON.stringify(lifeEduLocalBackup_());localStorage.setItem(LIFE_EDU_LOCAL_KEY,serialized);LIFE_EDU_STATE.storageSnapshot=serialized;
    var label=document.getElementById('leLocalSaveStatus');if(label)label.textContent='本機已保存 '+new Date().toLocaleTimeString('zh-HK',{hour:'2-digit',minute:'2-digit'});return true;
  }catch(error){lifeEduToast_(error.message||'本機保存失敗；儲存空間可能已滿。請先下載 JSON 備份。',true);return false;}
}
function lifeEduPersistLocal_(){
  if(LIFE_EDU_STATE.crossTabWriteDepth>0)return Promise.resolve(lifeEduPersistLocalNow_());
  var manager=window.navigator&&window.navigator.locks;
  if(!manager||typeof manager.request!=='function'){lifeEduToast_('此瀏覽器未提供安全的跨分頁鎖定；沒有保存本機記錄。',true);return Promise.resolve(false);}
  return manager.request('local-tools:thank-teacher-cards:write',{},function(){return lifeEduPersistLocalNow_();}).catch(function(error){lifeEduToast_(error.message||'本機保存失敗；請先下載 JSON 備份。',true);return false;});
}

function lifeEduRender_(){
  var previousPreparation=document.getElementById('leImportPanel'),previousAdvanced=document.getElementById('leAdvancedPanel'),previousOverview=document.querySelector('.le-overview');
  var workflowLayout={preparationOpen:previousPreparation?previousPreparation.open:true,advancedOpen:Boolean(previousAdvanced&&previousAdvanced.open),overviewOpen:Boolean(previousOverview&&previousOverview.open)};
  lifeEduRevokePageImageUrls_();lifeEduRevokeSourcePreviewUrls_();
  var rows=LIFE_EDU_STATE.rows,selected=lifeEduSelected_();
  var classes=[];rows.forEach(function(row){var name=String(row.className||'').trim();if(name&&classes.indexOf(name)<0)classes.push(name);});
  var rosterTitle=classes.length?classes.map(lifeEduEsc_).join('、')+' 名冊':'學生名冊';
  var required=rows.filter(function(r){return !r.exempt&&Number(r.expectedSheets)>0;});
  var expected=rows.reduce(function(n,r){return n+(Number(r.expectedSheets)||0);},0);
  var counted=required.filter(function(r){return r.physicalReceived!==''&&r.physicalReceived!=null;});
  var received=counted.reduce(function(n,r){return n+(Number(r.physicalReceived)||0);},0);
  var gap=counted.reduce(function(n,r){return n+Math.max(0,Number(r.expectedSheets||0)-Number(r.physicalReceived||0));},0);
  var scanned=rows.reduce(function(n,r){return n+(Number(r.scannedSheets)||0);},0);
  var classTeachers=((LIFE_EDU_STATE.meta||{}).classTeachers||[]).join('、'),classProgress=lifeEduClassProgress_(rows);
  document.getElementById('leApp').innerHTML=
    '<section class="le-intro"><div><div class="le-eyebrow">公開瀏覽器工具・資料保存在此瀏覽器</div><h2>文章核對、收稿追蹤及感恩卡製作</h2><p>目前名冊 '+rows.length+' 人；已核實應交 '+expected+' 張。掃描頁數與紙本收件數分開記錄。 <span id="leLocalSaveStatus" class="le-local-save-status">本機記錄已載入</span></p></div>'+
    '<div class="le-actions"><button class="le-button le-button-quiet" type="button" data-le-export="csv">匯出 CSV</button><button class="le-button le-button-quiet" type="button" data-le-export="json">下載 JSON 文字備份</button><button class="le-button le-button-quiet" type="button" data-le-export="zip">下載完整備份 ZIP</button><button class="le-button le-button-quiet" type="button" data-le-clean-orphans>檢查／清理未引用附件</button><button class="le-button" type="button" data-le-export-word>匯出此生 Word 卡片</button><span id="leAttachmentCleanupStatus" class="le-import-message" role="status"></span></div></section>'+
    '<div class="le-notice"><b>張數規則：</b>名冊「2」欄剔號＝應交2張；其他剔號＝1張；「1」下方圈號＝免交。預計應收 '+expected+' 張。紙本已收欄留空代表尚待點收，不能用已提供的掃描頁數代替。'+
      '<div class="le-source-line">班主任名冊 OCR：'+lifeEduEsc_(classTeachers||'待核')+'。所屬小學及正式學號不在目前來源內，待匯入正式資料。</div></div>'+
    '<section class="le-stats"><div class="le-stat"><b>'+rows.length+'</b><span>名冊學生</span></div><div class="le-stat"><b>'+expected+'</b><span>應交文章張數</span></div><div class="le-stat"><b>'+received+' / '+counted.length+'</b><span>已點收張數／人數</span></div><div class="le-stat"><b>'+scanned+'</b><span>目前掃描頁數</span></div><div class="le-stat"><b>'+gap+'</b><span>已核實欠交張數</span></div></section>'+classProgress+
    '<details class="le-panel le-import-panel" id="leImportPanel"><summary>匯入內容清單、名單／文章資料及 Word 範本</summary><div class="le-import-content">'+
      '<div class="le-import-grid"><article class="le-import-card"><h3>① 學生名單 Excel／CSV／JSON</h3><p>正式名冊以「班別＋班號」配對，可匯入姓名、學號、小學、性別、社別和張數。只有姓名和小學的 Excel 資料表，會按已載入名冊的中英文姓名作唯一配對。</p><ul><li>正式名冊標題：班別、班號、正式學號、中文姓名、英文姓名、所屬小學、性別、社別、應交張數、紙本已收張數、掃描頁數</li><li>Excel 小學資料表可用「中文姓名／Student Name (ENG)／之前就讀小學」；須先匯入含班別和班號的學生名冊。「No.」不會當作班號；找不到或姓名不唯一的資料不會配對。</li><li>匯入採合併更新，未列出的學生保留。</li></ul></article>'+
      '<article class="le-import-card"><h3>② 文章 OCR／批改資料 JSON</h3><p>可匯入逐頁 OCR JSON，按班別及班號合併；本機完整備份請用 ZIP，內含 PDF 掃描附件及逐頁工作區。</p><ul><li><code>sourceOcrText, verifiedOcrText, correctedText</code></li><li><code>ocrStudentName, ocrTeacherName, ocrPrimarySchool</code> 只存 OCR 候選，不覆蓋正式欄位</li><li>JSON 文字備份不含 PDF／色稿影像附件；ZIP 還原會取代目前資料並先要求確認</li></ul></article>'+
      '<article class="le-import-card"><h3>③ 感恩卡 Word 範本 DOCX</h3><p>在 Word 範本放入欄位標記。此工具會代入所選學生資料，並依字體大小設定產生 DOCX。</p><ul><li><code>{teacherDisplay}</code>、<code>{correctedText}</code></li><li><code>{studentName}</code>、<code>{studentNameEn}</code></li><li><code>{className}</code>、<code>{classNumber}</code></li><li><code>{studentNumber}</code>、<code>{primarySchool}</code>、<code>{activityTitle}</code></li></ul></article></div>'+
      '<section class="le-ocr-import"><h3>④ OCR 影像與貼上結果</h3><p>可貼上 Gemini、MiniMax 或其他 OCR 的文字／JSON；也可輸入自己的 MiniMax API key，在本頁直接進行單頁影像 OCR。OCR 結果先保留在原始 OCR 和核對後 OCR，老師修訂稿不會被改寫。</p><div class="le-ocr-controls"><label class="le-field le-ocr-key">MiniMax API key（只在本次要求使用）<input id="leMiniMaxKey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="貼上 key；不會保存"></label><label class="le-field le-ocr-page">掃描頁碼（可留空）<input id="leOcrPageNumber" type="number" min="1" max="1000" step="1" placeholder="例如 1"></label><label class="le-button le-button-quiet le-button-small" for="leOcrImage">選擇單頁影像</label><input class="le-hidden" id="leOcrImage" type="file" accept="image/jpeg,image/png,image/webp"><span id="leOcrImageName" class="le-file-name">未選擇影像</span><button class="le-button le-button-small" type="button" data-le-minimax-ocr>送 MiniMax OCR</button><span id="leMiniMaxStatus" class="le-import-message" role="status"></span></div><p class="le-ocr-privacy">按下 OCR 後，所選影像和 API key 會由瀏覽器直接傳送到 MiniMax API；不會先經過 Local-tools 伺服器，也不會儲存在本工具。每次最多一張 5 MB 影像。請先確認校方資料處理要求，並避免傳送不需辨認的聯絡資料。</p><label class="le-field le-ocr-paste-label" for="leOcrPaste">貼上 Gemini／MiniMax OCR 結果</label><textarea id="leOcrPaste" class="le-textarea le-ocr-paste" spellcheck="false" placeholder="可貼純文章文字或單頁 JSON，例如 {&quot;page&quot;:1,&quot;class&quot;:&quot;例如 1A&quot;,&quot;classNumber&quot;:4,&quot;studentName&quot;:&quot;…&quot;,&quot;teacherName&quot;:&quot;…&quot;,&quot;ocrText&quot;:&quot;…&quot;}"></textarea><div class="le-ocr-paste-actions"><label class="le-review-check"><input id="leOcrAppend" type="checkbox">追加至所選學生原文（續頁使用）</label><button class="le-button le-button-quiet le-button-small" type="button" data-le-import-ocr>貼入所選學生</button><span class="le-muted">貼入後請檢查候選姓名／班號，再按「儲存此學生」。</span></div></section>'+
      '<div class="le-import-controls"><label class="le-button le-button-quiet le-button-small" for="leDataFile">匯入 Excel／CSV／JSON／完整 ZIP</label><input class="le-hidden" id="leDataFile" type="file" accept=".xlsx,.xls,.csv,.json,.txt,.zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/json,text/csv,application/zip"><span id="leDataName" class="le-file-name">未選擇資料檔</span><button class="le-button le-button-quiet le-button-small" type="button" data-le-download-csv-template>下載 CSV 欄位範本</button><button class="le-button le-button-quiet le-button-small" type="button" data-le-use-default-template>載入預設卡片範本</button><label class="le-button le-button-quiet le-button-small" for="leTemplateFile">選擇 Word 範本 DOCX</label><input class="le-hidden" id="leTemplateFile" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"><span id="leTemplateName" class="le-file-name">'+lifeEduEsc_(LIFE_EDU_STATE.templateName||'尚未載入範本')+'</span><button class="le-button le-button-quiet le-button-small" type="button" data-le-download-template>下載預設範本</button><span id="leImportMessage" class="le-import-message" role="status"></span></div>'+
      '<div class="le-library-warning" id="leLibraryWarning"></div></div></details>'+
    '<div class="le-main-grid"><aside class="le-panel le-roster"><div class="le-roster-head"><h3>'+rosterTitle+'</h3><span>'+rows.length+' 人</span></div><div class="le-roster-tools"><input id="leSearch" type="search" placeholder="搜尋姓名、英文名或班號" value="'+lifeEduEsc_(LIFE_EDU_STATE.search)+'"><select id="leFilter"><option value="all">全部狀態</option><option value="待點收">待點收</option><option value="待核張數">待核張數</option><option value="欠交">已核實欠交</option><option value="已收齊">已收齊</option><option value="免交">免交</option><option value="待改文">文章待處理</option></select></div><div id="leRosterList" class="le-roster-list">'+rows.map(lifeEduRosterButton_).join('')+'</div></aside>'+
    '<div class="le-work"><section class="le-panel le-editor">'+(selected?lifeEduEditor_(selected):'<p class="le-muted">名冊沒有資料。</p>')+'</section>'+lifeEduPreviewPanel_()+'</div></div>'+
    '<section class="le-panel le-workflow"><h3>建議工作流程</h3><ol><li><b>匯入名單：</b>以班別、班號配對，核對正式學號及所屬小學。</li><li><b>剔選數量：</b>設定應交張數，再點收紙本已收數量。</li><li><b>整批匯入並完成配對：</b>在本機合併 PDF／JPG／PNG，逐頁指定學生。</li><li><b>逐頁 OCR 後匯入：</b>複製圖片和 Gemini 提示，核對文字及身份候選；OCR 不會更改第三步配對。</li><li><b>老師批改：</b>檢查錯字、文句通順和格式；保留學生原意，不清楚處請學生確認。</li><li><b>預覽及匯出：</b>在第六步檢視內頁右頁，調整字體、文字欄寬和高度，按行數及佔位判斷是否請學生增減內容；可下載／複製 PNG 或列印雙面 PDF，DOCX 為可選匯出。</li></ol><div class="le-workflow-note">建議在匯入或批改前下載 JSON 備份。匯入本工具完整 JSON 備份會取代本機記錄；匯入名單或 OCR JSON 則按班別及班號合併。班號用來配對本次班別資料，不代替正式學籍號碼。</div></section>';
  var importGrid=document.querySelector('.le-import-grid');if(importGrid)importGrid.insertAdjacentHTML('afterend',lifeEduCardDesignPanel_());
  var importControls=document.querySelector('.le-import-controls');if(importControls)importControls.insertAdjacentHTML('beforebegin',lifeEduPdfWorkspacePanel_());
  var filter=document.getElementById('leFilter');if(filter)filter.value=LIFE_EDU_STATE.filter;
  lifeEduArrangeWorkflow_(workflowLayout);
  lifeEduBind_();lifeEduApplyFilter_();lifeEduRefreshPreviews_();lifeEduRefreshSourcePreviews_();lifeEduRestoreCachedPagePreviews_();lifeEduObservePageThumbnails_();lifeEduUpdatePageView_();
}

// Presentation-only reordering: move existing controls before binding events.
// Keep all IDs and data attributes so import, persistence and OCR rules stay shared.
function lifeEduArrangeWorkflow_(layout){
  var root=document.getElementById('leApp'),intro=root.querySelector('.le-intro'),importPanel=document.getElementById('leImportPanel'),content=importPanel.querySelector('.le-import-content');
  function element(tag,className,html){var node=document.createElement(tag);node.className=className;if(html)node.innerHTML=html;return node;}
  function move(target,selector){var node=root.querySelector(selector);if(node)target.appendChild(node);return node;}
  function heading(number,title,description){return '<div class="le-step-heading"><span class="le-step-number">'+number+'</span><div><h2>'+title+'</h2><p>'+description+'</p></div></div>';}
  intro.querySelector('h2').textContent='由名單到感恩卡，依次完成六步';
  var actions=intro.querySelector('.le-actions');
  var nav=element('nav','le-step-nav','<a href="#leStep1">1 名單</a><a href="#leStep2">2 剔選數量</a><a href="#leStep3">3 匯入初稿</a><a href="#leStep4">4 逐頁 OCR</a><a href="#leStep5">5 老師修訂</a><a href="#leStep6">6 預覽匯出</a>');
  nav.setAttribute('aria-label','謝師恩工作步驟');intro.after(nav);
  var localNote=element('p','le-local-guidance','名單、文章和附件保存在目前瀏覽器。Google 登入不會同步資料；Drive 備份暫停中。換裝置前請到進階區下載完整 ZIP。');nav.after(localNote);
  var overview=element('details','le-panel le-overview','<summary>查看全班進度與紙本點收規則</summary>');localNote.after(overview);
  overview.open=layout.overviewOpen;
  move(overview,'.le-stats');move(overview,'#leClassProgress');move(overview,'.le-notice');
  var advanced=element('details','le-panel le-import-panel le-advanced','<summary>進階工具：備份還原、範本、色稿及其他 OCR</summary><div class="le-advanced-content"></div>');
  advanced.open=layout.advancedOpen;
  advanced.id='leAdvancedPanel';var advancedContent=advanced.lastElementChild;
  var backup=element('section','le-advanced-group','<h3>備份與資料轉移</h3><p>完整 ZIP 包含掃描附件；JSON 只備份文字及設定。還原備份會取代目前資料，操作前會要求確認。</p><label class="le-button le-button-quiet" for="leDataFile">匯入名單 Excel／CSV 或 JSON／完整 ZIP 備份</label>');
  advancedContent.appendChild(backup);
  var exportWord=actions.querySelector('[data-le-export-word]'),exportCsv=actions.querySelector('[data-le-export="csv"]');
  if(exportWord)exportWord.remove();if(exportCsv)exportCsv.remove();backup.appendChild(actions);
  var firstCard=content.querySelector('.le-import-card');
  var step1=element('section','le-panel le-step',heading(1,'匯入學生名單','第一次使用先匯入名單；已有名冊可直接前往第 2 步。'));
  step1.id='leStep1';firstCard.querySelector('h3').remove();step1.appendChild(firstCard);
  var csvHelp=element('p','le-csv-help','<b>可直接上載 Excel：</b>支援 .xlsx／.xls，也可用 CSV。正式名冊標題需有「班別」和「班號」；只有姓名和小學的資料表可按已匯入名冊的中英文姓名唯一配對。「No.」不會當作班號。小學欄可用「之前就讀小學」、「所屬小學」、「所屬小學名稱」、「小學名稱」或「小學」。工作表在本機讀取，不會上傳。');step1.appendChild(csvHelp);
  var rosterControls=element('div','le-import-controls le-primary-import');step1.appendChild(rosterControls);
  ['label[for="leDataFile"]','#leDataFile','#leDataName','[data-le-download-csv-template]','#leImportMessage'].forEach(function(selector){move(rosterControls,selector);});
  rosterControls.querySelector('label').textContent='上載學生名單 Excel／CSV／JSON';
  var quantityStep=element('section','le-panel le-step le-quantity-step',heading(2,'剔選數量','依名冊剔號設定每位學生應交張數，再點收實際收到的紙本；更改後會自動保存到目前瀏覽器。'));
  quantityStep.id='leStep2';quantityStep.insertAdjacentHTML('beforeend',lifeEduQuantityReviewPanel_(LIFE_EDU_STATE.rows));
  var workspace=content.querySelector('.le-pdf-workspace'),pdfHead=workspace.querySelector('.le-pdf-head');
  var step3=element('section','le-panel le-step',heading(3,'整批匯入 PDF 初稿並完成配對','一次選擇多份 PDF 初稿，也可混合 JPG／PNG。載入後逐頁配對名冊學生；第四步才做 OCR 並匯入文章。'));step3.id='leStep3';
  var matchPanel=content.querySelector('.le-page-match-panel');pdfHead.querySelector('h3').remove();pdfHead.querySelector('p').textContent='可一次載入多份 PDF／JPG／PNG；每頁會保留來源檔名，配對在本機保存。';step3.appendChild(pdfHead);if(matchPanel)step3.appendChild(matchPanel);
  pdfHead.querySelector('label[for="lePdfFile"]').textContent='整批匯入 PDF 初稿／JPG／PNG';
  var pageExports=element('section','le-advanced-group','<h3>逐頁來源匯出</h3><p>先在第 3 步載入掃描，再下載單頁 PDF 集合或配對記錄。</p>');advancedContent.appendChild(pageExports);
  ['[data-le-split-all]','[data-le-export-page-json]'].forEach(function(selector){move(pageExports,selector);});
  workspace.id='leStep4';workspace.className='le-panel le-step le-pdf-workspace';
  workspace.querySelector('label[for="lePageOcrPaste"]').textContent='貼上單頁或多頁 Gemini OCR JSON';
  // The remaining original import controls are advanced-only, with their original IDs.
  var remainingGrid=content.querySelector('.le-import-grid');
  remainingGrid.querySelectorAll('h3').forEach(function(h){h.textContent=h.textContent.replace(/^[②③]\s*/, '');});
  var mini=content.querySelector('.le-ocr-import');mini.querySelector('h3').textContent='其他 OCR：MiniMax 或直接貼入所選學生';
  var extraOcr=element('details','le-advanced-sub','<summary>MiniMax OCR／直接貼入文章</summary>');extraOcr.appendChild(mini);
  var templates=element('section','le-advanced-group','<h3>卡片範本與進階資料匯入</h3><p>一般流程可沿用現有範本；需要更換 Word 範本或匯入其他資料時使用以下設定。</p>');
  templates.appendChild(remainingGrid);templates.appendChild(content.querySelector('.le-import-controls'));
  advancedContent.appendChild(templates);advancedContent.appendChild(extraOcr);
  var optionalExports=element('section','le-advanced-group','<h3>可選 Word／表格匯出</h3><p>Word DOCX 可逐名匯出；CSV 會匯出全班記錄。</p>');if(exportWord){exportWord.textContent='可選：匯出此生 Word 卡片 DOCX';exportWord.classList.add('le-button-quiet');optionalExports.appendChild(exportWord);}if(exportCsv){exportCsv.textContent='匯出全班記錄 CSV';optionalExports.appendChild(exportCsv);}advancedContent.appendChild(optionalExports);
  var library=content.querySelector('.le-library-warning');if(library)intro.after(library);var cardDesignPanel=content.querySelector('.le-design-import');
  content.replaceChildren(step1,quantityStep,step3,workspace);
  importPanel.open=layout.preparationOpen;importPanel.className='le-preparation';importPanel.querySelector('summary').textContent='步驟 1–4：準備名單、剔選數量、匯入初稿與 OCR（可收起）';
  var grid=root.querySelector('.le-main-grid'),preview=root.querySelector('.le-preview-panel');
  var step5=element('section','le-review-step',heading(5,'老師修訂文章','以核對後 OCR 為底稿，編輯提示語後可交 Gemini Web 或 MiniMax；比較修訂位置，再由老師確認及保存。保存後到第六步按右頁預覽調整字體和文字區，判斷是否請學生增減內容。'));step5.id='leStep5';grid.before(step5);step5.appendChild(grid);
  var scan=root.querySelector('.le-scan-panel'),source=document.getElementById('leSourceOcr');if(scan&&source)source.previousElementSibling.before(scan);
  var step6=element('section','le-output-step',heading(6,'上載卡面、預覽及交給學生','上載封面和內頁色稿，調整右頁字體、文字欄寬及文字區高度；看行數和佔位，再決定是否請學生增減內容。'));step6.id='leStep6';step5.after(step6);if(cardDesignPanel)step6.appendChild(cardDesignPanel);step6.appendChild(preview);
  step6.after(advanced);
  backup.querySelector('label[for="leDataFile"]').addEventListener('click',function(){importPanel.open=true;});
  var oldWorkflow=root.querySelector('.le-workflow');if(oldWorkflow)oldWorkflow.remove();
  nav.querySelectorAll('a').forEach(function(link){link.addEventListener('click',function(){var target=document.getElementById(link.hash.slice(1));for(var parent=target&&target.parentElement;parent;parent=parent.parentElement){if(parent.tagName==='DETAILS')parent.open=true;}});});
}

function lifeEduQuantityReviewPanel_(rows){
  var optionsExpected='<option value="">待核張數</option><option value="0">免交（圈號）</option>';
  for(var expected=1;expected<=20;expected++)optionsExpected+='<option value="'+expected+'">'+expected+' 張</option>';
  var optionsReceived='<option value="">未點收</option>';
  for(var received=0;received<=20;received++)optionsReceived+='<option value="'+received+'">已收 '+received+' 張</option>';
  var body=(rows||[]).map(function(row){
    var expectedValue=row.exempt||row.expectedSheets!==''&&row.expectedSheets!=null&&Number(row.expectedSheets)===0?'0':row.expectedSheets==null?'':String(row.expectedSheets),receivedValue=row.physicalReceived==null?'':String(row.physicalReceived),status=lifeEduSubmissionStatus_(row);
    var expectedOptions=optionsExpected.replace('value="'+expectedValue+'"','value="'+expectedValue+'" selected'),receivedOptions=optionsReceived.replace('value="'+receivedValue+'"','value="'+receivedValue+'" selected');
    return '<tr data-le-quantity-row="'+lifeEduEsc_(row.id)+'"><th scope="row"><span>'+lifeEduEsc_(row.className)+' 第'+lifeEduEsc_(row.classNumber)+'號</span><small>'+lifeEduEsc_(row.nameZh||'待確認姓名')+' '+lifeEduEsc_(row.nameEn||'')+'</small></th><td>'+lifeEduEsc_(row.primarySchool||'—')+'</td><td><label class="le-quantity-field"><span class="le-sr-only">'+lifeEduEsc_(row.className)+' 第'+lifeEduEsc_(row.classNumber)+'號應交張數</span><select data-le-quantity="expected" aria-label="'+lifeEduEsc_(row.className)+' 第'+lifeEduEsc_(row.classNumber)+'號應交張數">'+expectedOptions+'</select></label></td><td><label class="le-quantity-field"><span class="le-sr-only">'+lifeEduEsc_(row.className)+' 第'+lifeEduEsc_(row.classNumber)+'號紙本已收張數</span><select data-le-quantity="received" aria-label="'+lifeEduEsc_(row.className)+' 第'+lifeEduEsc_(row.classNumber)+'號紙本已收張數">'+receivedOptions+'</select></label></td><td><span class="le-pill '+lifeEduPill_(status)+'" data-le-quantity-status>'+lifeEduEsc_(status)+'</span></td></tr>';
  }).join('');
  return '<div class="le-quantity-review"><div class="le-quantity-summary"><b>應交張數</b>按名冊「1／2」剔號設定；圈號選「免交」。<br><b>紙本已收</b>按實際收回數量點選；留空代表尚未點收。掃描頁不會自動計作紙本已收。</div><p class="le-quantity-status" id="leQuantityStatus" role="status" aria-live="polite">更改數量後會自動保存。</p><div class="le-quantity-wrap"><table class="le-quantity-table"><thead><tr><th>班別／學生</th><th>所屬小學</th><th>應交</th><th>紙本已收</th><th>點收狀態</th></tr></thead><tbody>'+(body||'<tr><td colspan="5">先在步驟 1 匯入學生名單。</td></tr>')+'</tbody></table></div></div>';
}
function lifeEduSaveQuantitySelection_(select){
  var rowNode=select.closest('[data-le-quantity-row]'),id=rowNode&&rowNode.dataset.leQuantityRow,row=LIFE_EDU_STATE.rows.filter(function(item){return item.id===id;})[0];if(!row)return;
  if(LIFE_EDU_STATE.dirty){var pending=document.getElementById('leQuantityStatus');if(pending){pending.className='le-quantity-status error';pending.textContent='請先到第 5 步保存目前學生的編輯，再更改點收數量。';}var committed=LIFE_EDU_STATE.savedRows.filter(function(item){return item.id===id;})[0];if(committed){var expectedNode=rowNode.querySelector('[data-le-quantity="expected"]'),receivedNode=rowNode.querySelector('[data-le-quantity="received"]');expectedNode.value=committed.exempt?'0':committed.expectedSheets==null?'':String(committed.expectedSheets);receivedNode.value=committed.physicalReceived==null?'':String(committed.physicalReceived);}return;}
  var expectedSelect=rowNode.querySelector('[data-le-quantity="expected"]'),receivedSelect=rowNode.querySelector('[data-le-quantity="received"]'),expected=expectedSelect.value,received=receivedSelect.value;
  if((expected!==''&&!/^(?:0|[1-9]\d?)$/.test(expected))||(received!==''&&!/^(?:0|[1-9]\d?)$/.test(received))||Number(expected)>20||Number(received)>20){lifeEduSetImportMessage_(document.getElementById('leQuantityStatus'),'張數必須在 0 至 20 之間。',true);return;}
  var original=LIFE_EDU_STATE.savedRows.filter(function(item){return item.id===id;})[0];row.expectedSheets=expected===''?'':String(Number(expected));row.exempt=expected==='0';row.physicalReceived=received===''?'':String(Number(received));
  if(row.exempt)row.reviewStatus='豁免';else if(row.reviewStatus==='豁免')row.reviewStatus='待收稿';
  lifeEduSyncQuantityToCurrentEditor_(row);
  rowNode.querySelectorAll('select').forEach(function(item){item.disabled=true;});
  var status=document.getElementById('leQuantityStatus');if(status){status.className='le-quantity-status';status.textContent='正在保存 '+row.className+' 第'+row.classNumber+'號…';}
  lifeEduUpdateQuantityRowStatus_(rowNode,row);lifeEduUpdateQuantitySummary_();
  lifeEduPersistLocal_().then(function(saved){
    if(saved){LIFE_EDU_STATE.savedRows=lifeEduClone_(LIFE_EDU_STATE.rows);lifeEduSyncQuantityToCurrentEditor_(row);if(status)status.textContent='已保存 '+row.className+' 第'+row.classNumber+'號的應交及紙本點收數量。';lifeEduUpdateQuantitySummary_();return;}
    if(original)LIFE_EDU_STATE.rows=LIFE_EDU_STATE.rows.map(function(item){return item.id===id?lifeEduClone_(original):item;});
    var restored=LIFE_EDU_STATE.rows.filter(function(item){return item.id===id;})[0];if(restored){expectedSelect.value=restored.exempt?'0':restored.expectedSheets==null?'':String(restored.expectedSheets);receivedSelect.value=restored.physicalReceived==null?'':String(restored.physicalReceived);lifeEduUpdateQuantityRowStatus_(rowNode,restored);lifeEduSyncQuantityToCurrentEditor_(restored);}
    if(status){status.className='le-quantity-status error';status.textContent='本機保存失敗，已還原此列數量；請確認本機記錄狀態後重試。';}lifeEduUpdateQuantitySummary_();
  }).finally(function(){rowNode.querySelectorAll('select').forEach(function(item){item.disabled=false;});});
}
function lifeEduUpdateQuantityRowStatus_(rowNode,row){
  var status=rowNode&&rowNode.querySelector('[data-le-quantity-status]'),value=lifeEduSubmissionStatus_(row);if(status){status.className='le-pill '+lifeEduPill_(value);status.textContent=value;}
  var button=Array.prototype.slice.call(document.querySelectorAll('[data-le-select]')).filter(function(item){return item.dataset.leSelect===row.id;})[0];if(button){var wrapper=document.createElement('div');wrapper.innerHTML=lifeEduRosterButton_(row);var replacement=wrapper.firstElementChild;if(replacement){button.dataset.leStatus=replacement.dataset.leStatus;button.dataset.lePending=replacement.dataset.lePending;button.dataset.leSearch=replacement.dataset.leSearch;button.innerHTML=replacement.innerHTML;button.className=replacement.className;}}
}
function lifeEduSyncQuantityToCurrentEditor_(row){if(!row||row.id!==LIFE_EDU_STATE.selectedId)return;var expected=document.getElementById('leExpectedSheets'),received=document.getElementById('lePhysicalReceived'),exempt=document.getElementById('leExempt'),review=document.getElementById('leReviewStatus');if(expected)expected.value=row.exempt?'0':row.expectedSheets==null?'':String(row.expectedSheets);if(received)received.value=row.physicalReceived==null?'':String(row.physicalReceived);if(exempt)exempt.checked=Boolean(row.exempt);if(review)review.value=row.reviewStatus||'待身份核對';var submit=document.querySelector('.le-submit-line .le-pill');if(submit){var status=lifeEduSubmissionStatus_(row);submit.textContent=status;submit.className='le-pill '+(status==='已完成遞交'||status==='免交'?'ok':status.indexOf('欠交')===0?'warn':'');}}
function lifeEduUpdateQuantitySummary_(){
  var rows=LIFE_EDU_STATE.rows,required=rows.filter(function(row){return !row.exempt&&Number(row.expectedSheets)>0;}),expected=rows.reduce(function(sum,row){return sum+(Number(row.expectedSheets)||0);},0),counted=required.filter(function(row){return row.physicalReceived!==''&&row.physicalReceived!=null;}),received=counted.reduce(function(sum,row){return sum+(Number(row.physicalReceived)||0);},0),gap=counted.reduce(function(sum,row){return sum+Math.max(0,Number(row.expectedSheets||0)-(Number(row.physicalReceived)||0));},0),scanned=rows.reduce(function(sum,row){return sum+(Number(row.scannedSheets)||0);},0);
  var values=[rows.length,expected,received+' / '+counted.length,scanned,gap];document.querySelectorAll('.le-stats .le-stat b').forEach(function(node,index){if(values[index]!==undefined)node.textContent=values[index];});
  var intro=document.querySelector('.le-intro p');if(intro){var saveStatus=document.getElementById('leLocalSaveStatus'),saveText=saveStatus&&saveStatus.textContent||'本機記錄已載入';intro.innerHTML='目前名冊 '+rows.length+' 人；已核實應交 '+expected+' 張。掃描頁數與紙本收件數分開記錄。 <span id="leLocalSaveStatus" class="le-local-save-status">'+lifeEduEsc_(saveText)+'</span>';}
  var notice=document.querySelector('.le-notice');if(notice){var teachers=((LIFE_EDU_STATE.meta||{}).classTeachers||[]).join('、');notice.innerHTML='<b>張數規則：</b>名冊「2」欄剔號＝應交2張；其他剔號＝1張；「1」下方圈號＝免交。預計應收 '+expected+' 張。紙本已收欄留空代表尚待點收，不能用已提供的掃描頁數代替。<div class="le-source-line">班主任名冊 OCR：'+lifeEduEsc_(teachers||'待核')+'。所屬小學及正式學號以匯入名冊為準。</div>';}
  lifeEduUpdateClassProgress_();
}
function lifeEduClassProgress_(rows){
  if(!rows.length)return '';
  var groups=Object.create(null);rows.forEach(function(row){var name=String(row.className||'待分班').trim()||'待分班';(groups[name]||(groups[name]=[])).push(row);});
  var names=Object.keys(groups).sort(function(a,b){return a.localeCompare(b,'zh-Hant');});
  var body=names.map(function(name){var students=groups[name],required=students.filter(function(row){return !row.exempt&&row.expectedSheets!==''&&row.expectedSheets!=null&&Number(row.expectedSheets)>0;}),expected=required.reduce(function(sum,row){return sum+Number(row.expectedSheets||0);},0),received=required.reduce(function(sum,row){return sum+(row.physicalReceived===''||row.physicalReceived==null?0:Number(row.physicalReceived)||0);},0),complete=required.filter(function(row){return row.physicalReceived!==''&&row.physicalReceived!=null&&Number(row.physicalReceived)>=Number(row.expectedSheets);}).length,short=required.reduce(function(sum,row){return sum+Math.max(0,Number(row.expectedSheets||0)-(Number(row.physicalReceived)||0));},0),pending=students.filter(function(row){return !row.exempt&&(row.expectedSheets===''||row.expectedSheets==null);}).length,pendingReceive=required.filter(function(row){return row.physicalReceived===''||row.physicalReceived==null;}).length,scans=students.reduce(function(sum,row){return sum+(Number(row.scannedSheets)||0);},0),reviewed=required.filter(function(row){return row.reviewStatus==='已完成';}).length;
    return '<tr><th scope="row">'+lifeEduEsc_(name)+'</th><td>'+students.length+'</td><td>'+expected+'</td><td>'+received+'</td><td>'+complete+' / '+required.length+'</td><td>'+short+'</td><td>'+scans+'</td><td>'+reviewed+' / '+required.length+'</td><td>'+pending+' 張數待核'+(pendingReceive?' · '+pendingReceive+' 人待點收':'')+'</td></tr>';}).join('');
  return '<section id="leClassProgress" class="le-panel le-class-progress"><div class="le-section-head"><h3>按班進度總表</h3><span>「完成遞交」按紙本已收張數計算；掃描頁數及老師批改狀態分開統計。</span></div><div class="le-progress-wrap"><table class="le-progress-table"><thead><tr><th>班別</th><th>人數</th><th>應交張數</th><th>紙本已收</th><th>完成遞交</th><th>欠交張數</th><th>掃描頁</th><th>批改完成</th><th>待處理</th></tr></thead><tbody>'+body+'</tbody></table></div></section>';
}
function lifeEduUpdateClassProgress_(){var target=document.getElementById('leClassProgress');if(target)target.outerHTML=lifeEduClassProgress_(LIFE_EDU_STATE.rows);}

function lifeEduRosterButton_(row){
  var status=lifeEduStatus_(row), pending=!row.exempt&&row.reviewStatus!=='已完成';
  var filterStatus=status==='免交'?'免交':status==='待點收'?'待點收':status==='待核張數'?'待核張數':status.indexOf('欠')===0?'欠交':'已收齊';
  var find=[row.classNumber,row.nameZh,row.nameEn].join(' ').toLowerCase();
  return '<button type="button" class="le-student'+(row.id===LIFE_EDU_STATE.selectedId?' on':'')+'" data-le-select="'+lifeEduEsc_(row.id)+'" data-le-status="'+filterStatus+'" data-le-pending="'+(pending?'1':'0')+'" data-le-search="'+lifeEduEsc_(find)+'"><span class="le-student-no">'+lifeEduEsc_(row.classNumber)+'</span><span class="le-student-main"><b>'+lifeEduEsc_(row.nameZh||'待辨讀')+'</b><small>'+lifeEduEsc_(row.nameEn||'')+'</small><small>應交 '+(row.exempt?'免交':row.expectedSheets===''||row.expectedSheets==null?'待核張數':Number(row.expectedSheets)+'張')+' · 紙本 '+(row.physicalReceived===''||row.physicalReceived==null?'待點收':Number(row.physicalReceived)+'張')+' · '+lifeEduEsc_(lifeEduSubmissionStatus_(row))+'</small></span><span class="le-pill '+lifeEduPill_(status)+'">'+lifeEduEsc_(status)+'</span></button>';
}

function lifeEduEditor_(row){
  var statuses=LIFE_EDU_REVIEW_STATUSES.map(function(s){return '<option value="'+lifeEduEsc_(s)+'"'+(row.reviewStatus===s?' selected':'')+'>'+lifeEduEsc_(s)+'</option>';}).join('');
  var source=lifeEduSourceUrl_(row.sourceUrl);
  var doubts=row.ocrNote?'<div class="le-notice"><b>OCR／名冊疑點：</b>'+lifeEduEsc_(row.ocrNote)+'</div>':'';
  return '<div class="le-editor-head"><div><div class="le-eyebrow">'+lifeEduEsc_(row.className)+' · 班內編號 '+lifeEduEsc_(row.classNumber)+'</div><h3>'+lifeEduEsc_(row.nameZh||'待辨讀')+'</h3><div class="le-muted">'+lifeEduEsc_(row.nameEn||'')+'　·　收稿：'+lifeEduEsc_(lifeEduStatus_(row))+'</div></div><span id="leDirty" class="le-muted'+(LIFE_EDU_STATE.dirty?' le-unsaved':'')+'">'+(LIFE_EDU_STATE.dirty?'有未儲存更改':'已載入')+'</span></div>'+doubts+
    '<div class="le-editor-grid">'+lifeEduInput_('中文姓名（名冊 OCR）','nameZh',row.nameZh)+lifeEduInput_('英文姓名','nameEn',row.nameEn)+lifeEduInput_('正式學號','studentNumber',row.studentNumber,'來源未見；匯入正式資料')+
      lifeEduInput_('所屬小學','primarySchool',row.primarySchool,'來源未見；核實後填寫')+lifeEduInput_('性別','gender',row.gender)+lifeEduInput_('社別','house',row.house)+lifeEduInput_('收件老師','teacherName',row.teacherName,'須核實姓名')+lifeEduInput_('老師職銜','teacherTitle',row.teacherTitle,'老師／主任／校長')+
      lifeEduInput_('OCR 姓名候選（待核）','ocrStudentName',row.ocrStudentName,'不會覆蓋正式姓名')+lifeEduInput_('OCR 老師候選（待核）','ocrTeacherName',row.ocrTeacherName,'不會覆蓋收件老師')+lifeEduInput_('OCR 小學候選（待核）','ocrPrimarySchool',row.ocrPrimarySchool,'不會覆蓋所屬小學')+
      lifeEduInput_('應交張數','expectedSheets',row.expectedSheets,'','number',0,20)+lifeEduInput_('紙本已收張數','physicalReceived',row.physicalReceived,'留空＝尚待點收','number',0,20)+lifeEduInput_('掃描頁數','scannedSheets',row.scannedSheets,'與紙本收件分開','number',0,20)+lifeEduInput_('來源掃描連結','sourceUrl',row.sourceUrl,'可留空','url',null,null,'le-field-wide')+'</div>'+
    '<label class="le-check-line"><input id="leExempt" type="checkbox"'+(row.exempt?' checked':'')+'> 名冊「1」下方圈號，免交文章</label><p class="le-help">「'+lifeEduEsc_(row.className||'班別')+' 第'+lifeEduEsc_(row.classNumber)+'號」是班內編號，不是正式學號。留空的紙本已收張數代表尚未點收；掃描頁數不會代替點收。</p>'+
    '<div class="le-section-head"><h4>原始 OCR</h4><span>保留辨讀結果供比對</span></div><textarea class="le-textarea le-textarea-original" id="leSourceOcr" readonly placeholder="目前沒有文章掃描 OCR。">'+lifeEduEsc_(row.sourceOcrText||'')+'</textarea>'+
    '<div class="le-section-head"><h4>核對後 OCR</h4><span>可逐字修正；原文仍保留在上方</span></div><textarea class="le-textarea" id="leVerifiedOcr" maxlength="2800" placeholder="輸入核對後的原文">'+lifeEduEsc_(row.verifiedOcrText||'')+'</textarea>'+
    '<section class="le-teacher-revision"><div class="le-section-head"><h4>AI 修訂助手</h4><span>先用核對後 OCR 作原稿；AI 只產生建議，老師決定是否採用</span></div><label class="le-field le-field-wide">預設老師修訂提示語（可按需要微調）<textarea class="le-textarea" id="leTeacherRevisionPrompt" data-le-tool-state maxlength="3000">'+lifeEduEsc_(LIFE_EDU_STATE.teacherRevisionPrompt||lifeEduDefaultTeacherRevisionPrompt_())+'</textarea></label><div class="le-prompt-actions"><button class="le-button le-button-quiet le-button-small" type="button" data-le-copy-edit-prompt>複製完整提示到 Gemini Web</button><button class="le-button le-button-quiet le-button-small" type="button" data-le-reset-edit-prompt>還原預設提示</button><span class="le-muted">在 Gemini Web 產生修訂後，把結果貼到下方建議稿。</span></div><div class="le-minimax-revision-controls"><label class="le-field">MiniMax API key（只用於本次要求）<input id="leTeacherRevisionKey" data-le-tool-state type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="貼上 key；不會保存"></label><button class="le-button le-button-small" type="button" data-le-minimax-revision>用 MiniMax 產生修訂稿</button><span id="leTeacherRevisionStatus" class="le-import-message" role="status" aria-live="polite"></span></div><p class="le-ocr-privacy">只有按下 MiniMax 按鈕後，核對後文章、提示語和一次性 API key 才會由瀏覽器直接傳送至 MiniMax；key 不會保存。使用 Gemini 時，只有按複製並自行貼到 Gemini Web 才會傳送。</p><label class="le-field le-field-wide" for="leRevisionCandidate">Gemini／MiniMax 建議修訂稿<textarea class="le-textarea le-revision-candidate" id="leRevisionCandidate" data-le-tool-state maxlength="3000" placeholder="把 Gemini Web 的修訂結果貼在這裡；MiniMax 結果會出現在這裡"></textarea></label><button class="le-button le-button-quiet le-button-small" type="button" data-le-adopt-revision>採用至老師修訂稿</button></section><div class="le-section-head"><h4>老師修訂稿</h4><span>第五步採納後供第六步右頁排版預覽；Word 為可選備用匯出</span></div><textarea class="le-textarea le-textarea-draft" id="leCorrectedText" maxlength="2800" placeholder="修正錯字、文句及格式；不清楚處保留待學生確認">'+lifeEduEsc_(row.correctedText||'')+'</textarea><div class="le-revision-preview-panel"><div class="le-section-head"><h4>修訂位置預覽</h4><span>點擊標色文字，查看原稿及修訂內容</span></div><div id="leRevisionDiffPreview" class="le-revision-diff-preview" aria-live="polite"></div></div><dialog id="leRevisionDiffDialog" class="le-revision-diff-dialog" aria-labelledby="leRevisionDiffTitle"><div class="le-revision-diff-dialog-inner"><h3 id="leRevisionDiffTitle">修改內容</h3><div class="le-revision-diff-pair"><b>原稿</b><pre data-le-revision-before></pre></div><div class="le-revision-diff-pair"><b>修訂稿</b><pre data-le-revision-after></pre></div><button class="le-button le-button-quiet" type="button" data-le-close-revision-diff>關閉</button></div></dialog>'+
    '<div class="le-review-row"><label class="le-field">老師核對狀態<select id="leReviewStatus">'+statuses+'</select></label><fieldset><legend>批改項目</legend>'+lifeEduCheck_('錯字已核對','checkSpelling',row.checkSpelling)+lifeEduCheck_('文句已核對','checkFlow',row.checkFlow)+lifeEduCheck_('格式已核對','checkFormat',row.checkFormat)+lifeEduCheck_('待學生澄清','studentFollowup',row.studentFollowup)+'</fieldset></div>'+
    '<div class="le-submit-line"><b>紙本遞交：</b><span class="le-pill '+(lifeEduSubmissionStatus_(row)==='已完成遞交'||lifeEduSubmissionStatus_(row)==='免交'?'ok':lifeEduSubmissionStatus_(row).indexOf('欠交')===0?'warn':'')+'">'+lifeEduEsc_(lifeEduSubmissionStatus_(row))+'</span><span class="le-muted">依「紙本已收張數」計算，掃描頁數不會自動算作已遞交。</span></div>'+
    '<div class="le-editor-grid"><label class="le-field le-field-wide">OCR／姓名核對記錄<textarea class="le-textarea" id="leOcrNote" maxlength="500">'+lifeEduEsc_(row.ocrNote||'')+'</textarea></label><label class="le-field le-field-wide">老師批改備註<textarea class="le-textarea" id="leTeacherNote" maxlength="900">'+lifeEduEsc_(row.teacherNote||'')+'</textarea></label></div>'+
    lifeEduScanPanel_(row)+
    '<div class="le-editor-bottom"><div class="le-editor-meta">'+(source?'<a class="le-link" target="_blank" rel="noopener" href="'+lifeEduEsc_(source)+'">開啟文章來源掃描</a>':'<span>未提供文章掃描連結</span>')+'<span>班主任名冊 OCR：'+lifeEduEsc_(((LIFE_EDU_STATE.meta||{}).classTeachers||[]).join('、'))+'</span><span>'+(row.updatedAt?'最後更新 '+lifeEduEsc_(row.updatedAt):'尚未修改')+'</span></div><div><span id="leSaveMsg" class="le-save-msg" role="status"></span><button type="button" class="le-button" data-le-save>儲存此學生</button></div></div>';
}
function lifeEduScanPanel_(row){
  var versions=Array.isArray(row.scanVersions)?row.scanVersions:[],active=versions.filter(function(item){return item.active;}),activeSheets=active.reduce(function(sum,item){return sum+(Number(item.sheets)||1);},0);
  var history=versions.length?'<ul class="le-scan-history">'+versions.slice().reverse().map(function(item){return '<li><span><b>'+lifeEduEsc_(item.kind||'初次收件')+'</b> · '+lifeEduEsc_(item.fileName||'掃描檔')+' · '+(item.active?'現行':'舊版本')+' · '+Number(item.sheets||1)+'頁 · '+lifeEduEsc_(item.uploadedAt||'')+'</span><button class="le-button le-button-quiet le-button-small" type="button" data-le-attachment-download="'+lifeEduEsc_(item.id)+'">下載</button></li>';}).join('')+'</ul>':'<p class="le-muted">此學生未有掃描附件。</p>';
  var previews=active.slice(0,6).map(function(item){return '<figure class="le-source-preview"><img data-le-source-preview="'+lifeEduEsc_(item.id)+'" alt="'+lifeEduEsc_(item.fileName||'學生原稿掃描')+'" hidden><figcaption>'+lifeEduEsc_(item.fileName||'學生原稿')+' · '+Number(item.sheets||1)+'頁</figcaption></figure>';}).join('');
  return '<section class="le-scan-panel"><div class="le-section-head"><h4>掃描版本與補交</h4><span>現行附件 '+activeSheets+' 頁；舊版本保留</span></div><p class="le-help">「補交」會加入現行掃描；「更新內容」會將現有附件標為舊版本，並以新檔作現行版本。可用手機相機拍照；掃描頁數會按現行附件更新，紙本已收張數仍需另外點收。</p><div class="le-scan-controls"><label class="le-field">上載方式<select id="leScanKind" data-le-scan-control><option value="補交">補交（加入現行附件）</option><option value="更新內容">更新內容（取代現行附件）</option></select></label><label class="le-button le-button-quiet le-button-small" for="leScanFile">拍照／選擇學生掃描 PDF、JPG 或 PNG</label><input id="leScanFile" class="le-hidden" data-le-scan-control type="file" accept="application/pdf,.pdf,image/jpeg,.jpg,.jpeg,image/png,.png,image/webp" capture="environment"><span id="leScanFileName" class="le-file-name">未選擇掃描檔</span><button type="button" class="le-button le-button-small" data-le-upload-scan>保存掃描版本</button><span id="leScanStatus" class="le-import-message" role="status"></span></div><div class="le-source-preview-grid">'+(previews||'<p class="le-muted">保存學生掃描後，這裡會顯示原稿圖片預覽。</p>')+'</div>'+history+'</section>';
}
function lifeEduInput_(label,key,value,placeholder,type,min,max,extraClass){
  var id='le'+key.charAt(0).toUpperCase()+key.slice(1),safe=lifeEduEsc_(value==null?'':value);
  var attrs=type==='number'?' type="number" min="'+min+'" max="'+max+'" step="1"':type==='url'?' type="url"':' type="text"';
  var el=type==='select'?'<select id="'+id+'">'+placeholder+'</select>':'<input id="'+id+'"'+attrs+' value="'+safe+'" placeholder="'+lifeEduEsc_(placeholder||'')+'">';
  return '<label class="le-field '+(extraClass||'')+'"><span>'+lifeEduEsc_(label)+'</span>'+el+'</label>';
}
function lifeEduCheck_(label,key,checked){return '<label class="le-review-check"><input id="le'+key.charAt(0).toUpperCase()+key.slice(1)+'" type="checkbox"'+(checked?' checked':'')+'>'+lifeEduEsc_(label)+'</label>';}

function lifeEduNormalizePdfWorkspace_(raw){
  if(!raw||typeof raw!=='object')return null;
  var pageCount=Math.max(0,Math.min(300,Number(raw.pageCount)||0));
  var rawPages=Array.isArray(raw.pages)?raw.pages:[],oversized=rawPages.filter(function(page){return page&&String(page.ocrText||'').length>2800;});if(oversized.length)throw new Error('逐頁備份內有 OCR 文字超過 2,800 字；已停止還原，避免截掉文章。');
  var pages=rawPages.filter(function(page){return page&&Number.isInteger(Number(page.pageNumber))&&Number(page.pageNumber)>0&&Number(page.pageNumber)<=pageCount;}).map(function(page){return {pageNumber:Number(page.pageNumber),sourceFileName:String(page.sourceFileName||'').slice(0,240),className:String(page.className||'').slice(0,50),classNumber:page.classNumber==null?'':String(page.classNumber).slice(0,8),studentName:String(page.studentName||'').slice(0,160),primarySchool:String(page.primarySchool||'').slice(0,160),teacherName:String(page.teacherName||'').slice(0,160),ocrText:String(page.ocrText||''),uncertainNotes:String(page.uncertainNotes||'').slice(0,500),assignedStudentId:String(page.assignedStudentId||'').slice(0,100),importedAt:String(page.importedAt||'').slice(0,50),importedAttachmentId:String(page.importedAttachmentId||'').slice(0,100),replacesImportedAttachmentId:String(page.replacesImportedAttachmentId||'').slice(0,100),replacingImport:Boolean(page.replacingImport)};} );
  return {sourceFileId:String(raw.sourceFileId||'').slice(0,100),fileName:String(raw.fileName||'掃描原稿.pdf').slice(0,240),pageCount:pageCount,pages:pages,updatedAt:String(raw.updatedAt||'').slice(0,50)};
}
function lifeEduPdfWorkspacePanel_(){
  var workspace=LIFE_EDU_STATE.pdfWorkspace,pages=workspace&&workspace.pages||[];
  var pageCards=pages.map(function(page){
    var assigned=LIFE_EDU_STATE.rows.filter(function(row){return row.id===page.assignedStudentId;})[0],assignedLabel=assigned?assigned.className+' 第'+assigned.classNumber+'號 · '+(assigned.nameZh||assigned.nameEn||'待辨讀'):'第三步尚未配對';
    var normalizedClass=lifeEduNormalizeClassName_(page.className),validClassNumber=/^\d{1,3}$/.test(String(page.classNumber||'')),exact=normalizedClass&&validClassNumber?LIFE_EDU_STATE.rows.filter(function(row){return lifeEduNormalizeClassName_(row.className)===normalizedClass&&Number(row.classNumber)===Number(page.classNumber);}):[];
    var nameMismatch=assigned&&page.studentName&&assigned.nameZh&&String(page.studentName).trim()!==String(assigned.nameZh).trim(),identityMismatch=assigned&&((normalizedClass&&lifeEduNormalizeClassName_(assigned.className)!==normalizedClass)||(validClassNumber&&Number(assigned.classNumber)!==Number(page.classNumber)));
    var identity='<span class="le-page-identity">OCR身份候選：'+lifeEduEsc_([page.className,page.classNumber&&'第'+page.classNumber+'號',page.studentName].filter(Boolean).join(' · ')||'尚未辨讀')+'</span><span class="le-page-assignment" data-le-page-assigned="'+page.pageNumber+'">第三步配對：'+lifeEduEsc_(assignedLabel)+'</span>'+(nameMismatch||identityMismatch?'<span class="le-page-warning">OCR身份候選與第三步配對不同，匯入前請人工核實。</span>':'');
    var text=page.ocrText?'<details><summary>查看 OCR 原文（'+page.ocrText.length+' 字）</summary><pre>'+lifeEduEsc_(page.ocrText)+'</pre></details>':'<span class="le-muted">尚未有此頁 OCR 文字</span>';
    var canImport=Boolean(page.assignedStudentId&&page.ocrText&&(!page.importedAt||page.replacingImport)&&!page.importing),button='<button class="le-button le-button-small" type="button" data-le-import-page="'+page.pageNumber+'"'+(canImport?'':' disabled')+'>'+(page.importing?'匯入中…':page.replacingImport?'更新已匯入文章':page.importedAt?'已匯入 '+lifeEduEsc_(page.importedAt.slice(0,10)):'匯入配對文章')+'</button>';
    var thumbnail='<div class="le-page-thumb-wrap"><img class="le-page-thumb" data-le-page-thumb="'+page.pageNumber+'" alt="原稿第 '+page.pageNumber+' 頁縮圖" loading="lazy"><div><button class="le-button le-button-quiet le-button-small" type="button" data-le-load-thumbnail="'+page.pageNumber+'">載入縮圖</button><button class="le-button le-button-quiet le-button-small" type="button" data-le-open-page="'+page.pageNumber+'">逐頁檢視</button></div></div>';
    var originalImage='<div class="le-page-image-tools"><button class="le-button le-button-quiet le-button-small" type="button" data-le-preview-page="'+page.pageNumber+'">產生原稿圖片</button><button class="le-button le-button-quiet le-button-small" type="button" data-le-copy-page-image="'+page.pageNumber+'" disabled>複製圖片交 Gemini</button><button class="le-button le-button-quiet le-button-small" type="button" data-le-copy-ocr-prompt="'+page.pageNumber+'">複製本頁 Gemini OCR 提示</button><label class="le-button le-button-quiet le-button-small" for="leReplacePage'+page.pageNumber+'">拍照／選檔替換本頁</label><input class="le-hidden" id="leReplacePage'+page.pageNumber+'" type="file" accept="application/pdf,.pdf,image/jpeg,.jpg,.jpeg,image/png,.png" capture="environment" data-le-replace-page-file="'+page.pageNumber+'"'+(page.importing?' disabled':'')+'></div><img class="le-page-image-preview" data-le-page-image="'+page.pageNumber+'" alt="原稿第 '+page.pageNumber+' 頁" loading="lazy" hidden><span class="le-page-thumb-status" data-le-page-thumb-status="'+page.pageNumber+'"></span>';
    var source=page.sourceFileName||workspace.fileName||'掃描檔';
    var importMessage=page.replacingImport?'已替換已匯入頁面的初稿；重做 OCR 後更新附件，保留老師核對稿。':page.importedAt?'已匯入學生記錄。':page.assignedStudentId?'已在第三步配對；OCR 後可匯入文章。':'請先在第三步配對學生。';
    return '<article class="le-page-card" data-le-page-card="'+page.pageNumber+'"><div class="le-page-card-title"><b>第 '+page.pageNumber+' 頁</b><span class="le-muted">'+lifeEduEsc_(source)+'</span><button class="le-button le-button-quiet le-button-small" type="button" data-le-download-page="'+page.pageNumber+'">下載單頁 PDF</button></div>'+thumbnail+originalImage+identity+'<div class="le-page-card-ocr">'+text+'</div><div class="le-page-card-bottom"><span class="le-muted">'+lifeEduEsc_(importMessage)+'</span>'+button+'</div></article>';
  }).join('');
  var loaded=workspace?'已載入 '+lifeEduEsc_(workspace.fileName)+' · '+workspace.pageCount+' 頁':'未載入 PDF／JPG／PNG';
  var assignedCount=pages.filter(function(page){return LIFE_EDU_STATE.rows.some(function(row){return row.id===page.assignedStudentId;});}).length;
  return '<section class="le-pdf-workspace"><div class="le-pdf-head"><div><h3>整批初稿</h3><p>可一次選多份 PDF、JPG 或 PNG；工具按所選次序合併並分頁。第三步的配對表會列在此區之後。</p></div><div class="le-pdf-actions"><label class="le-button le-button-quiet le-button-small" for="lePdfFile">整批匯入 PDF／JPG／PNG</label><input id="lePdfFile" class="le-hidden" type="file" accept="application/pdf,.pdf,image/jpeg,.jpg,.jpeg,image/png,.png" multiple><button class="le-button le-button-quiet le-button-small" type="button" data-le-split-all '+(workspace?'':'disabled')+'>下載全部單頁 PDF ZIP</button><button class="le-button le-button-quiet le-button-small" type="button" data-le-export-page-json '+(workspace?'':'disabled')+'>匯出逐頁配對 JSON</button><span class="le-file-name" id="lePdfName">'+(workspace?'已載入 '+lifeEduEsc_(workspace.fileName)+' · '+workspace.pageCount+' 頁':'未載入 PDF／JPG／PNG')+'</span><span id="lePdfImportStatus" class="le-import-message" role="status" aria-live="polite"></span></div></div>'+
    '<section class="le-page-match-panel"><div class="le-section-head"><h3>每頁配對學生</h3><span id="lePageMatchSummary">'+(workspace?assignedCount+' / '+workspace.pageCount+' 頁已配對':'先整批匯入初稿')+'</span></div><p class="le-help">第三步在這裡完成每頁與名冊學生配對。第四步 OCR 只提供身份候選供核對，絕不改動配對；已匯入頁會鎖定原配對。</p>'+(workspace?'<div class="le-page-match-wrap"><table class="le-page-match-table"><thead><tr><th>頁碼／來源</th><th>配對學生</th><th>OCR身份候選</th></tr></thead><tbody>'+pages.map(function(page){var assigned=LIFE_EDU_STATE.rows.filter(function(row){return row.id===page.assignedStudentId;})[0],options='<option value="">待配對</option>'+LIFE_EDU_STATE.rows.map(function(row){var label=row.className+' 第'+row.classNumber+'號 · '+(row.nameZh||row.nameEn||'待辨讀'),selected=row.id===page.assignedStudentId?' selected':'';return '<option value="'+lifeEduEsc_(row.id)+'"'+selected+'>'+lifeEduEsc_(label)+'</option>';}).join('');return '<tr data-le-page-match-row="'+page.pageNumber+'"><th scope="row">第 '+page.pageNumber+' 頁<small>'+lifeEduEsc_(page.sourceFileName||workspace.fileName)+'</small></th><td><select data-le-page-match="'+page.pageNumber+'" aria-label="第 '+page.pageNumber+' 頁配對學生"'+(page.importing||page.importedAt?' disabled':'')+'>'+options+'</select></td><td><span data-le-page-match-status="'+page.pageNumber+'">'+lifeEduEsc_([page.className,page.classNumber&&'第'+page.classNumber+'號',page.studentName].filter(Boolean).join(' · ')||'待 OCR 後核對')+'</span><small data-le-page-match-assigned="'+page.pageNumber+'">'+(assigned?'已配對 '+lifeEduEsc_(assigned.className)+' 第'+lifeEduEsc_(assigned.classNumber)+'號':'尚未配對')+'</small></td></tr>';}).join('')+'</tbody></table></div>':'<p class="le-muted">先在步驟三整批匯入 PDF／JPG／PNG 初稿。</p>')+'</section>'+
    '<div class="le-page-ocr-tools"><div class="le-step-heading"><span class="le-step-number">4</span><div><h2>逐頁 OCR 後匯入文章</h2><p>第三步配對已完成；按頁複製圖片及 Gemini 提示，貼回指定 JSON，核對後才匯入配對學生。</p></div></div><div class="le-page-replace-all"><label class="le-button le-button-quiet" for="lePdfReplaceAllFile">整批替換 PDF／圖片初稿</label><input class="le-hidden" id="lePdfReplaceAllFile" type="file" multiple accept="application/pdf,.pdf,image/jpeg,.jpg,.jpeg,image/png,.png"><span class="le-muted">同頁數替換會保留配對，已匯入頁需重做 OCR 後更新該頁附件。</span></div><div class="le-gemini-skill"><div><b>Gemini OCR Skill</b><p>下載後可在 Gemini 建立 Gem，於「知識／Knowledge → 新增檔案／Add files → 上傳」加入。Gem 的操作指示已寫在檔案內。</p></div><a class="le-button le-button-quiet le-button-small" href="gemini-teacher-article-ocr-skill.md" download>下載 Gemini OCR Skill</a><ol><li>在 Gemini 網頁版開啟側邊欄「Gems」，選「New Gem」並填名稱和指示。</li><li>在「Knowledge」選「Add files」→「Upload files」，上載剛下載的 Skill，再儲存 Gem。</li><li>逐頁複製原稿圖片和本頁 OCR 提示，到 Gem 辨讀；把 JSON 貼回下方，再套用並匯入。</li></ol><a href="https://support.google.com/gemini/answer/15146780?hl=zh-Hant" target="_blank" rel="noopener">Google Gemini Gems 官方設定說明</a><span class="le-gemini-mobile-note">在網頁建立的 Gem 可在 Gemini 手機 App 使用。</span></div></div>'+
    '<div class="le-page-ocr-import"><label class="le-field" for="lePageOcrPaste">貼上單頁或多頁 Gemini OCR JSON</label><textarea id="lePageOcrPaste" class="le-textarea" placeholder="單頁：{&quot;page&quot;:1,&quot;className&quot;:&quot;1A&quot;,&quot;classNumber&quot;:&quot;4&quot;,&quot;studentName&quot;:&quot;學生姓名&quot;,&quot;primarySchool&quot;:&quot;所屬小學&quot;,&quot;teacherName&quot;:&quot;老師姓名&quot;,&quot;ocrText&quot;:&quot;文章原文&quot;,&quot;uncertainNotes&quot;:[]}"></textarea><button class="le-button le-button-small" type="button" data-le-apply-page-ocr '+(workspace?'':'disabled')+'>按頁碼套用 OCR 結果</button><span class="le-import-message" id="leOcrStatus" role="status" aria-live="polite"></span><p class="le-help">套用只會保存 OCR 候選與原文；身份配對仍以第三步為準。頁數、配對和 OCR 文字都核實後，再按該頁「匯入配對文章」。</p></div><div class="le-page-view-controls"><div role="group" aria-label="初稿預覽模式"><button type="button" class="le-button le-button-quiet le-button-small" data-le-page-view="grid" aria-pressed="'+(LIFE_EDU_STATE.pdfPageView==='grid'?'true':'false')+'">縮圖總覽</button><button type="button" class="le-button le-button-quiet le-button-small" data-le-page-view="single" aria-pressed="'+(LIFE_EDU_STATE.pdfPageView==='single'?'true':'false')+'">逐頁檢視</button></div><div class="le-page-navigation"><button type="button" class="le-button le-button-quiet le-button-small" data-le-page-nav="previous" '+(workspace?'':'disabled')+'>上一頁</button><span id="lePageViewPosition">'+(workspace?'第 '+(LIFE_EDU_STATE.pdfPageViewPage||1)+' / '+workspace.pageCount+' 頁':'尚未載入')+'</span><button type="button" class="le-button le-button-quiet le-button-small" data-le-page-nav="next" '+(workspace?'':'disabled')+'>下一頁</button></div></div><div class="le-page-list-head"><b>原稿頁面（'+pages.length+' 頁）</b><span>縮圖可快速查頁；逐頁檢視可用上一頁／下一頁切換。</span></div><div class="le-page-list le-page-list-'+(LIFE_EDU_STATE.pdfPageView==='single'?'single':'grid')+'">'+(pageCards||'<p class="le-muted">先在第三步載入 PDF 初稿。</p>')+'</div><span class="le-import-message" id="lePdfStatus" role="status" aria-live="polite"></span></section>';
}

function lifeEduPreviewPanel_(){
  var hasDesign=Boolean(LIFE_EDU_STATE.cardDesign),view=LIFE_EDU_STATE.cardView||'content';
  return '<section class="le-panel le-preview-panel"><div class="le-preview-head"><div><h3>內頁右頁預覽及輸出</h3><p>按卡片比例預覽文章；調整字體、文字欄寬和文字區高度，查看大約行數與佔位，再判斷是否請學生增減內容。Word 卡片是進階備用匯出。</p></div></div>'+
    '<div class="le-card-layout-controls"><label class="le-font-control" for="leFontSize">字體大小 <input id="leFontSize" type="range" min="12" max="28" step="1" value="'+LIFE_EDU_STATE.fontSize+'"><b><span id="leFontSizeLabel">'+LIFE_EDU_STATE.fontSize+'</span> pt</b></label><label class="le-font-control" for="leCardTextWidth">文字欄寬 <input id="leCardTextWidth" type="range" min="25" max="40" step="1" value="'+LIFE_EDU_STATE.cardTextWidthPct+'"><b><span id="leCardTextWidthLabel">'+LIFE_EDU_STATE.cardTextWidthPct+'</span>%</b></label><label class="le-font-control" for="leCardTextHeight">文字區高度 <input id="leCardTextHeight" type="range" min="30" max="50" step="1" value="'+LIFE_EDU_STATE.cardTextHeightPct+'"><b><span id="leCardTextHeightLabel">'+LIFE_EDU_STATE.cardTextHeightPct+'</span>%</b></label></div>'+
    '<section class="le-card-preview-box"><div class="le-preview-box-head"><b>內頁卡面效果</b><span>封面與內頁色稿可切換</span></div><div class="le-card-toolbar"'+(hasDesign?'':' hidden')+'><div class="le-card-view-controls"><button class="le-button le-button-quiet le-button-small'+(view==='cover'?' on':'')+'" type="button" data-le-card-view="cover" aria-pressed="'+(view==='cover'?'true':'false')+'">封面</button><button class="le-button le-button-quiet le-button-small'+(view==='content'?' on':'')+'" type="button" data-le-card-view="content" aria-pressed="'+(view==='content'?'true':'false')+'">內頁</button></div><div class="le-card-output-controls"><button class="le-button le-button-quiet le-button-small" type="button" data-le-download-content-image disabled>下載內頁 PNG 給學生</button><button class="le-button le-button-quiet le-button-small" type="button" data-le-copy-content-image disabled>複製內頁圖片</button><button class="le-button le-button-quiet le-button-small" type="button" data-le-print-card disabled>列印／儲存雙面 PDF</button></div></div><div class="le-card-stage"><div class="le-card-preview-frame" id="leCardPreviewFrame"><article class="le-card-preview" id="leCardPreview"></article></div></div><p id="leCardFitStatus" class="le-card-fit-status" role="status" aria-live="polite">上載內頁色稿後，這裡會顯示文章行數及文字區使用比例。</p><p id="leCardOutputStatus" class="le-import-message" role="status" aria-live="polite"></p></section><div id="leCardPrintDocument" class="le-card-print-document" aria-hidden="true"></div></section>';
}

function lifeEduCardDesignPanel_(){
  var design=LIFE_EDU_STATE.cardDesign||{};
  return '<section class="le-design-import"><div><h3>上載卡面</h3><p>第六步載入彩色封面和內頁 JPG／PNG／WebP。第五步採納稿會用於輸出；未採納前可先看 OCR 草稿預覽，但不能下載／列印給學生。色稿和附件只保存在此瀏覽器，完整 ZIP 備份會包含色稿。</p></div><div class="le-design-controls"><label class="le-button le-button-quiet le-button-small" for="leCardCoverFile">上載彩色封面</label><input id="leCardCoverFile" class="le-hidden" type="file" accept="image/jpeg,image/png,image/webp"><span class="le-file-name">'+lifeEduEsc_(design.cover&&design.cover.fileName||'尚未載入封面')+'</span><label class="le-button le-button-quiet le-button-small" for="leCardContentFile">上載彩色內頁</label><input id="leCardContentFile" class="le-hidden" type="file" accept="image/jpeg,image/png,image/webp"><span class="le-file-name">'+lifeEduEsc_(design.content&&design.content.fileName||'尚未載入內頁')+'</span><span id="leCardDesignStatus" class="le-import-message" role="status"></span></div></section>';
}
function lifeEduHandleCardDesignFile_(event,side){
  var file=event.target.files&&event.target.files[0],status=document.getElementById('leCardDesignStatus');if(!file)return;
  var mime=/\.jpe?g$/i.test(file.name)?'image/jpeg':/\.png$/i.test(file.name)?'image/png':/\.webp$/i.test(file.name)?'image/webp':file.type;
  if(['image/jpeg','image/png','image/webp'].indexOf(mime)<0||file.size>15*1024*1024){lifeEduSetImportMessage_(status,'色稿只接受 JPEG／PNG／WebP，單張上限 15 MB。',true);event.target.value='';return;}
  if(lifeEduAnyScanImportLocked_()){lifeEduSetImportMessage_(status,'掃描或備份操作尚未完成；完成後才可載入色稿。',true);event.target.value='';return;}
  var expectedSnapshot=localStorage.getItem(LIFE_EDU_LOCAL_KEY);lifeEduSetImportMessage_(status,'正在保存色稿到此瀏覽器…',false);
  var work=function(){var id=lifeEduNewFileId_(),record={id:id,fileName:file.name,mimeType:mime,createdAt:new Date().toISOString(),blob:new Blob([file],{type:mime})};return lifeEduAttachmentPut_(record).then(function(){var previous=LIFE_EDU_STATE.cardDesign?lifeEduClone_(LIFE_EDU_STATE.cardDesign):null,next=previous?lifeEduClone_(previous):{cover:null,content:null};next[side]={id:id,fileName:file.name,mimeType:mime,size:file.size};next.updatedAt=record.createdAt;LIFE_EDU_STATE.cardDesign=next;if(!lifeEduPersistLocalNow_()){LIFE_EDU_STATE.cardDesign=previous;return lifeEduAttachmentDelete_(id).then(function(){throw new Error('本機記錄未能保存；色稿沒有套用。');});}LIFE_EDU_STATE.savedRows=lifeEduClone_(LIFE_EDU_STATE.rows);LIFE_EDU_STATE.dirty=false;lifeEduRender_();lifeEduSetImportMessage_(document.getElementById('leCardDesignStatus'),'色稿已保存於此瀏覽器；它不會成為公開網站檔案。',false);});};
  lifeEduWithCrossTabWriteLock_(work,status,'另一個分頁正在處理本機資料；完成後再載入色稿。',expectedSnapshot).catch(function(error){lifeEduSetImportMessage_(status,error.message||'色稿載入失敗。',true);}).finally(function(){event.target.value='';});
}
function lifeEduEnsureCardDesignPreviewUrls_(){
  var design=LIFE_EDU_STATE.cardDesign||{},urls=LIFE_EDU_STATE.cardDesignUrls||(LIFE_EDU_STATE.cardDesignUrls={});
  ['cover','content'].forEach(function(side){var meta=design[side],current=urls[side];
    if(!meta){if(current&&current.url)URL.revokeObjectURL(current.url);urls[side]=null;return;}
    if(current&&current.id===meta.id&&current.url)return;
    if(current&&current.url)URL.revokeObjectURL(current.url);urls[side]={id:meta.id,url:''};
    lifeEduAttachmentGet_(meta.id).then(function(record){if(!record||!record.blob)throw new Error('找不到色稿附件。');if(!LIFE_EDU_STATE.cardDesign||!LIFE_EDU_STATE.cardDesign[side]||LIFE_EDU_STATE.cardDesign[side].id!==meta.id)return;urls[side]={id:meta.id,url:URL.createObjectURL(record.blob)};lifeEduRefreshPreviews_();}).catch(function(error){var target=document.getElementById('leCardDesignStatus');if(target)lifeEduSetImportMessage_(target,error.message||'無法讀取色稿。',true);});
  });
}
function lifeEduBind_(){
  document.querySelectorAll('[data-le-quantity]').forEach(function(select){select.addEventListener('change',function(){lifeEduSaveQuantitySelection_(select);});});
  document.querySelectorAll('[data-le-select]').forEach(function(button){button.addEventListener('click',function(){
    if(LIFE_EDU_STATE.teacherRevisionBusy){lifeEduToast_('MiniMax 正在修訂文章；完成後再切換學生。',true);return;}
    if(LIFE_EDU_STATE.dirty&&!window.confirm('目前學生有未儲存更改。放棄這些更改並切換？'))return;
    LIFE_EDU_STATE.selectedId=button.dataset.leSelect;LIFE_EDU_STATE.dirty=false;
    if(LIFE_EDU_STATE.savedRows.length)LIFE_EDU_STATE.rows=lifeEduClone_(LIFE_EDU_STATE.savedRows);
    lifeEduRender_();
  });});
  var search=document.getElementById('leSearch');if(search)search.addEventListener('input',function(){LIFE_EDU_STATE.search=search.value;lifeEduApplyFilter_();});
  var filter=document.getElementById('leFilter');if(filter)filter.addEventListener('change',function(){LIFE_EDU_STATE.filter=filter.value;lifeEduApplyFilter_();});
  var cleanOrphans=document.querySelector('[data-le-clean-orphans]');if(cleanOrphans)cleanOrphans.addEventListener('click',lifeEduCleanOrphanAttachments_);
  document.querySelectorAll('.le-editor input:not([data-le-scan-control]):not([data-le-tool-state]),.le-editor textarea:not([data-le-tool-state]),.le-editor select:not([data-le-scan-control]):not([data-le-tool-state])').forEach(function(el){el.addEventListener('input',lifeEduMarkDirty_);el.addEventListener('change',lifeEduMarkDirty_);});
  var revisionPrompt=document.getElementById('leTeacherRevisionPrompt');if(revisionPrompt)revisionPrompt.addEventListener('input',function(){LIFE_EDU_STATE.teacherRevisionPrompt=revisionPrompt.value;});
  var resetRevisionPrompt=document.querySelector('[data-le-reset-edit-prompt]');if(resetRevisionPrompt)resetRevisionPrompt.addEventListener('click',function(){LIFE_EDU_STATE.teacherRevisionPrompt=lifeEduDefaultTeacherRevisionPrompt_();var prompt=document.getElementById('leTeacherRevisionPrompt');if(prompt)prompt.value=LIFE_EDU_STATE.teacherRevisionPrompt;});
  var runRevision=document.querySelector('[data-le-minimax-revision]');if(runRevision)runRevision.addEventListener('click',lifeEduRunMiniMaxRevision_);
  var adoptRevision=document.querySelector('[data-le-adopt-revision]');if(adoptRevision)adoptRevision.addEventListener('click',lifeEduAdoptRevision_);
  var diffPreview=document.getElementById('leRevisionDiffPreview');if(diffPreview)diffPreview.addEventListener('click',function(event){var target=event.target.closest('[data-le-revision-change]');if(target)lifeEduShowRevisionChange_(Number(target.dataset.leRevisionChange));});
  var closeRevisionDiff=document.querySelector('[data-le-close-revision-diff]');if(closeRevisionDiff)closeRevisionDiff.addEventListener('click',function(){var dialog=document.getElementById('leRevisionDiffDialog');if(dialog&&dialog.open){if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');}});
  var save=document.querySelector('[data-le-save]');if(save)save.addEventListener('click',lifeEduSaveCurrent_);
  var font=document.getElementById('leFontSize');if(font)font.addEventListener('input',function(){var requested=Number(font.value)||16;LIFE_EDU_STATE.fontSize=requested;document.getElementById('leFontSizeLabel').textContent=requested;lifeEduRefreshPreviews_();lifeEduPersistLocal_().then(function(saved){if(saved||LIFE_EDU_STATE.fontSize!==requested)return;var committed=16;try{var snapshot=JSON.parse(LIFE_EDU_STATE.storageSnapshot||'null');if(snapshot&&Number(snapshot.fontSize))committed=Number(snapshot.fontSize);}catch(error){}LIFE_EDU_STATE.fontSize=committed;font.value=String(committed);document.getElementById('leFontSizeLabel').textContent=committed;lifeEduRefreshPreviews_();});});
  lifeEduBindCardPercentSlider_('leCardTextWidth','cardTextWidthPct','leCardTextWidthLabel',25,40,37);lifeEduBindCardPercentSlider_('leCardTextHeight','cardTextHeightPct','leCardTextHeightLabel',30,50,46);
  document.querySelectorAll('[data-le-card-view]').forEach(function(button){button.addEventListener('click',function(){LIFE_EDU_STATE.cardView=button.dataset.leCardView;lifeEduRefreshPreviews_();});});
  if(!LIFE_EDU_STATE.cardPreviewResizeBound){window.addEventListener('resize',lifeEduSyncCardPreviewScale_);LIFE_EDU_STATE.cardPreviewResizeBound=true;}
  var printCard=document.querySelector('[data-le-print-card]');if(printCard)printCard.addEventListener('click',function(){var row=lifeEduSelected_();if(!LIFE_EDU_STATE.cardDesign||!LIFE_EDU_STATE.cardDesign.cover||!LIFE_EDU_STATE.cardDesign.content){lifeEduToast_('請先載入封面和內頁色稿。',true);return;}if(!row||!String(row.correctedText||'').trim()){lifeEduToast_('請先在第五步採用並保存老師修訂稿。',true);return;}var overflow=lifeEduPrintOverflowIssues_(row);if(overflow.length){lifeEduToast_('列印卡面文字超出位置：'+overflow.join('、')+'。請調細字體或整理文字。',true);return;}window.print();});
  var downloadContentImage=document.querySelector('[data-le-download-content-image]');if(downloadContentImage)downloadContentImage.addEventListener('click',function(){lifeEduOutputContentCardImage_(false);});
  var copyContentImage=document.querySelector('[data-le-copy-content-image]');if(copyContentImage)copyContentImage.addEventListener('click',function(){lifeEduOutputContentCardImage_(true);});
  var coverDesignFile=document.getElementById('leCardCoverFile');if(coverDesignFile)coverDesignFile.addEventListener('change',function(event){lifeEduHandleCardDesignFile_(event,'cover');});
  var contentDesignFile=document.getElementById('leCardContentFile');if(contentDesignFile)contentDesignFile.addEventListener('change',function(event){lifeEduHandleCardDesignFile_(event,'content');});
  var dataFile=document.getElementById('leDataFile');if(dataFile)dataFile.addEventListener('change',lifeEduHandleDataFile_);
  var pdfFile=document.getElementById('lePdfFile');if(pdfFile)pdfFile.addEventListener('change',lifeEduHandlePdfFile_);
  var replaceAllFile=document.getElementById('lePdfReplaceAllFile');if(replaceAllFile)replaceAllFile.addEventListener('change',lifeEduHandleReplaceAllPdfFile_);
  document.querySelectorAll('[data-le-preview-page]').forEach(function(button){button.addEventListener('click',function(){lifeEduLoadPagePreview_(Number(button.dataset.lePreviewPage),button);});});
  document.querySelectorAll('[data-le-copy-page-image]').forEach(function(button){button.addEventListener('click',function(){lifeEduCopyPageImage_(Number(button.dataset.leCopyPageImage));});});
  document.querySelectorAll('[data-le-replace-page-file]').forEach(function(input){input.addEventListener('change',lifeEduHandleReplacePageFile_);});
  document.querySelectorAll('[data-le-open-page]').forEach(function(button){button.addEventListener('click',function(){LIFE_EDU_STATE.pdfPageView='single';LIFE_EDU_STATE.pdfPageViewPage=Number(button.dataset.leOpenPage);lifeEduUpdatePageView_();});});
  document.querySelectorAll('[data-le-load-thumbnail]').forEach(function(button){button.addEventListener('click',function(){lifeEduLoadPageThumbnail_(Number(button.dataset.leLoadThumbnail),button);});});
  document.querySelectorAll('[data-le-page-view]').forEach(function(button){button.addEventListener('click',function(){LIFE_EDU_STATE.pdfPageView=button.dataset.lePageView==='single'?'single':'grid';lifeEduUpdatePageView_();});});
  document.querySelectorAll('[data-le-page-nav]').forEach(function(button){button.addEventListener('click',function(){var step=button.dataset.lePageNav==='previous'?-1:1,workspace=LIFE_EDU_STATE.pdfWorkspace;if(!workspace)return;LIFE_EDU_STATE.pdfPageView='single';LIFE_EDU_STATE.pdfPageViewPage=Math.max(1,Math.min(workspace.pageCount,(Number(LIFE_EDU_STATE.pdfPageViewPage)||1)+step));lifeEduUpdatePageView_();});});
  document.querySelectorAll('[data-le-copy-ocr-prompt]').forEach(function(button){button.addEventListener('click',function(){lifeEduCopyGeminiOcrPrompt_(Number(button.dataset.leCopyOcrPrompt));});});
  var editPrompt=document.querySelector('[data-le-copy-edit-prompt]');if(editPrompt)editPrompt.addEventListener('click',lifeEduCopyGeminiEditPrompt_);
  var pageOcr=document.querySelector('[data-le-apply-page-ocr]');if(pageOcr)pageOcr.addEventListener('click',lifeEduApplyPageOcrPaste_);
  var splitAll=document.querySelector('[data-le-split-all]');if(splitAll)splitAll.addEventListener('click',lifeEduSplitAllPdf_);
  var exportPageJson=document.querySelector('[data-le-export-page-json]');if(exportPageJson)exportPageJson.addEventListener('click',lifeEduExportPageJson_);
  document.querySelectorAll('[data-le-download-page]').forEach(function(button){button.addEventListener('click',function(){lifeEduDownloadPdfPage_(Number(button.dataset.leDownloadPage));});});
  document.querySelectorAll('[data-le-page-match]').forEach(function(select){select.addEventListener('change',function(){var page=lifeEduGetPdfPage_(Number(select.dataset.lePageMatch)),workspace=LIFE_EDU_STATE.pdfWorkspace;if(!page||!workspace||page.importing||page.importedAt){if(page)select.value=page.assignedStudentId;return;}var oldId=page.assignedStudentId,oldUpdated=workspace.updatedAt;page.assignedStudentId=select.value;workspace.updatedAt=new Date().toISOString();lifeEduUpdatePageMatchUI_(page.pageNumber);lifeEduPersistLocal_().then(function(saved){if(!saved){page.assignedStudentId=oldId;workspace.updatedAt=oldUpdated;select.value=oldId;lifeEduUpdatePageMatchUI_(page.pageNumber);}});});});
  document.querySelectorAll('[data-le-import-page]').forEach(function(button){button.addEventListener('click',function(){lifeEduImportPdfPage_(Number(button.dataset.leImportPage));});});
  var scanFile=document.getElementById('leScanFile');if(scanFile)scanFile.addEventListener('change',lifeEduHandleScanFile_);
  var uploadScan=document.querySelector('[data-le-upload-scan]');if(uploadScan)uploadScan.addEventListener('click',lifeEduUploadScan_);
  document.querySelectorAll('[data-le-attachment-download]').forEach(function(button){button.addEventListener('click',function(){lifeEduDownloadAttachment_(button.dataset.leAttachmentDownload);});});
  var ocrImage=document.getElementById('leOcrImage');if(ocrImage)ocrImage.addEventListener('change',lifeEduHandleOcrImageFile_);
  var runOcr=document.querySelector('[data-le-minimax-ocr]');if(runOcr)runOcr.addEventListener('click',lifeEduRunMiniMaxOcr_);
  var importOcr=document.querySelector('[data-le-import-ocr]');if(importOcr)importOcr.addEventListener('click',lifeEduImportOcrPaste_);
  var templateFile=document.getElementById('leTemplateFile');if(templateFile)templateFile.addEventListener('change',lifeEduHandleTemplateFile_);
  document.querySelectorAll('[data-le-use-default-template]').forEach(function(b){b.addEventListener('click',lifeEduUseDefaultTemplate_);});
  document.querySelectorAll('[data-le-download-csv-template]').forEach(function(b){b.addEventListener('click',lifeEduDownloadCsvTemplate_);});
  document.querySelectorAll('[data-le-download-template]').forEach(function(b){b.addEventListener('click',lifeEduDownloadDefaultTemplate_);});
  document.querySelectorAll('[data-le-preview-word]').forEach(function(b){b.addEventListener('click',lifeEduPreviewWord_);});
  document.querySelectorAll('[data-le-export-word]').forEach(function(b){b.addEventListener('click',lifeEduExportWord_);});
  document.querySelectorAll('[data-le-export]').forEach(function(b){b.addEventListener('click',function(){lifeEduExportData_(b.dataset.leExport);});});
  lifeEduCheckLibraries_();
}

function lifeEduCheckLibraries_(){
  var missing=[];if(typeof PizZip==='undefined')missing.push('Word ZIP');if(typeof docxtemplater==='undefined')missing.push('Word 模板處理');if(typeof mammoth==='undefined')missing.push('Word 預覽');if(typeof PDFLib==='undefined')missing.push('PDF 拆頁');if(typeof pdfjsLib==='undefined')missing.push('PDF 原稿圖片預覽');
  var target=document.getElementById('leLibraryWarning');if(target&&missing.length)target.textContent='外部元件尚未載入：'+missing.join('、')+'。請檢查網絡連線後重新整理。';
}
function lifeEduApplyFilter_(){
  var q=String(LIFE_EDU_STATE.search||'').trim().toLowerCase(),f=LIFE_EDU_STATE.filter||'all';
  document.querySelectorAll('[data-le-select]').forEach(function(button){var status=button.dataset.leStatus,pending=button.dataset.lePending==='1';var matches=!q||(button.dataset.leSearch||'').indexOf(q)>=0;var statusOk=f==='all'||status===f||(f==='待改文'&&pending);button.classList.toggle('le-filtered-out',!(matches&&statusOk));});
}
function lifeEduCurrentForm_(){
  var get=function(id){var el=document.getElementById(id);return el?el.value:'';};var check=function(id){var el=document.getElementById(id);return !!(el&&el.checked);};
  return {id:LIFE_EDU_STATE.selectedId,nameZh:get('leNameZh'),nameEn:get('leNameEn'),studentNumber:get('leStudentNumber'),primarySchool:get('lePrimarySchool'),ocrStudentName:get('leOcrStudentName'),ocrTeacherName:get('leOcrTeacherName'),ocrPrimarySchool:get('leOcrPrimarySchool'),gender:get('leGender'),house:get('leHouse'),teacherName:get('leTeacherName'),teacherTitle:get('leTeacherTitle'),expectedSheets:get('leExpectedSheets'),physicalReceived:get('lePhysicalReceived'),scannedSheets:get('leScannedSheets'),sourceUrl:get('leSourceUrl'),sourceOcrText:get('leSourceOcr'),verifiedOcrText:get('leVerifiedOcr'),correctedText:get('leCorrectedText'),reviewStatus:get('leReviewStatus'),ocrNote:get('leOcrNote'),teacherNote:get('leTeacherNote'),exempt:check('leExempt'),checkSpelling:check('leCheckSpelling'),checkFlow:check('leCheckFlow'),checkFormat:check('leCheckFormat'),studentFollowup:check('leStudentFollowup')};
}
function lifeEduApplyFormToRow_(){
  var data=lifeEduCurrentForm_();if(lifeEduCountValidationError_(data))return null;LIFE_EDU_STATE.rows=LIFE_EDU_STATE.rows.map(function(row){return row.id===data.id?Object.assign({},row,data):row;});return data;
}
function lifeEduCountValidationError_(payload){
  var labels={expectedSheets:'應交張數',physicalReceived:'紙本已收張數',scannedSheets:'掃描頁數'};
  for(var key in labels){var value=payload[key];if(value===''||value===null||value===undefined)continue;var raw=String(value).trim();if(!/^\d{1,2}$/.test(raw)||Number(raw)>20)return labels[key]+'須為 0 至 20 的整數或留空。';}
  return '';
}
function lifeEduMarkDirty_(){
  var countError=lifeEduCountValidationError_(lifeEduCurrentForm_());
  if(countError){var invalidMsg=document.getElementById('leSaveMsg');if(invalidMsg){invalidMsg.textContent=countError+' 更正後才會保存。';invalidMsg.classList.add('error');}return;}
  LIFE_EDU_STATE.dirty=true;var dirty=document.getElementById('leDirty');if(dirty){dirty.textContent='有未儲存更改';dirty.classList.add('le-unsaved');}
  var saveMsg=document.getElementById('leSaveMsg');if(saveMsg){saveMsg.textContent='';saveMsg.classList.remove('error');}
  lifeEduApplyFormToRow_();lifeEduUpdateClassProgress_();lifeEduRefreshPreviews_();lifeEduPersistLocal_().then(function(saved){if(!saved){var warning=document.getElementById('leSaveMsg');if(warning){warning.textContent='更改仍在畫面中，但未保存；請重新載入前先處理另一分頁更新。';warning.classList.add('error');}}});
}
function lifeEduRefreshPreviews_(){
  var row=lifeEduSelected_();if(!row){var emptyPrintArea=document.getElementById('leCardPrintDocument');if(emptyPrintArea)emptyPrintArea.innerHTML='';return;}lifeEduRenderRevisionDiff_();lifeEduEnsureCardDesignPreviewUrls_();
  var card=document.getElementById('leCardPreview'),frame=document.getElementById('leCardPreviewFrame');if(card){var teacher=(row.teacherName||'〔收件老師待核〕')+(row.teacherTitle||''),body=row.correctedText||row.verifiedOcrText||'',uncertain=/〔|待核|待確認|待學生/i.test(body),view=LIFE_EDU_STATE.cardView||'content',urls=LIFE_EDU_STATE.cardDesignUrls||{},designUrl=urls[view]&&urls[view].url;
    card.style.setProperty('--le-card-font',lifeEduFontCssPx_(LIFE_EDU_STATE.fontSize));card.style.setProperty('--le-card-text-width',LIFE_EDU_STATE.cardTextWidthPct+'%');card.style.setProperty('--le-card-text-height',LIFE_EDU_STATE.cardTextHeightPct+'%');
    if(designUrl){if(frame)frame.classList.add('le-card-preview-frame-designed');card.classList.add('le-card-preview-designed');card.dataset.leCardView=view;var designImage='<img class="le-card-design-image" src="'+lifeEduEsc_(designUrl)+'" alt="">';
      if(view==='content')card.innerHTML=designImage+'<div class="le-card-art-recipient">'+lifeEduEsc_(teacher)+'</div><div class="le-card-art-message'+(!body?' le-card-empty':'')+'">'+lifeEduEsc_(body||'請在老師修訂稿填入感恩文章。')+'</div>'+(uncertain?'<div class="le-card-art-note">含待核字句；定稿前請確認</div>':'');
      else card.innerHTML=designImage+'<span class="le-card-art-caption">封面色稿預覽</span>';
      var designImageNode=card.querySelector('.le-card-design-image');if(designImageNode){var setDesignAspect=function(){if(designImageNode.naturalWidth&&designImageNode.naturalHeight){var aspect=designImageNode.naturalWidth+' / '+designImageNode.naturalHeight;if(frame)frame.style.aspectRatio=aspect;card.style.aspectRatio=aspect;}lifeEduSyncCardPreviewScale_();if(card.isConnected)lifeEduUpdateCardFitStatus_(lifeEduSelected_(),card);};designImageNode.addEventListener('load',setDesignAspect,{once:true});if(designImageNode.complete)setDesignAspect();}
    }else{if(frame){frame.classList.remove('le-card-preview-frame-designed');frame.style.removeProperty('aspect-ratio');}card.classList.remove('le-card-preview-designed');card.style.removeProperty('aspect-ratio');card.style.removeProperty('background-image');card.removeAttribute('data-le-card-view');card.innerHTML='<div><p class="le-card-title">'+lifeEduEsc_((LIFE_EDU_STATE.meta||{}).title||'箋紙濃情謝師恩')+'</p><p class="le-card-greeting">敬愛的'+lifeEduEsc_(teacher)+'：</p><div class="le-card-body'+(!body?' le-card-empty':'')+'">'+lifeEduEsc_(body||'請在老師修訂稿填入感恩文章。')+'</div>'+(uncertain?'<p class="le-source-line">含待核字句；定稿前請確認</p>':'')+'</div><div class="le-card-footer">'+lifeEduEsc_(row.nameZh||'〔學生姓名〕')+'<br>'+lifeEduEsc_(row.className||'〔班別〕')+' 第 '+lifeEduEsc_(row.classNumber)+' 號</div>';}
    var hasRevisedText=Boolean(String(row.correctedText||'').trim()),hasBothDesigns=Boolean(urls.cover&&urls.cover.url&&urls.content&&urls.content.url),printOverflow=hasBothDesigns&&hasRevisedText?lifeEduPrintOverflowIssues_(row):[],printArea=document.getElementById('leCardPrintDocument'),fit=document.getElementById('leCardFitStatus');if(printArea&&hasBothDesigns&&hasRevisedText&&!printOverflow.length){printArea.style.setProperty('--le-card-font',lifeEduFontCssPx_(LIFE_EDU_STATE.fontSize));printArea.style.setProperty('--le-card-text-width',LIFE_EDU_STATE.cardTextWidthPct+'%');printArea.style.setProperty('--le-card-text-height',LIFE_EDU_STATE.cardTextHeightPct+'%');printArea.innerHTML='<section class="le-print-card-page"><img src="'+lifeEduEsc_(urls.cover.url)+'" alt=""></section><section class="le-print-card-page"><img src="'+lifeEduEsc_(urls.content.url)+'" alt=""><div class="le-print-recipient">'+lifeEduEsc_(teacher)+'</div><div class="le-print-message">'+lifeEduEsc_(String(row.correctedText).trim())+'</div></section>';}else if(printArea)printArea.innerHTML='';
    lifeEduSyncCardPreviewScale_();var hasContentDesign=Boolean(LIFE_EDU_STATE.cardDesign&&LIFE_EDU_STATE.cardDesign.content);lifeEduUpdateCardFitStatus_(row,card,printOverflow);
    var print=document.querySelector('[data-le-print-card]');if(print)print.disabled=!(hasBothDesigns&&hasRevisedText&&!printOverflow.length);document.querySelectorAll('[data-le-download-content-image],[data-le-copy-content-image]').forEach(function(button){button.disabled=!(hasRevisedText&&hasContentDesign);});var outputStatus=document.getElementById('leCardOutputStatus');if(outputStatus&&!hasRevisedText&&hasContentDesign)lifeEduSetImportMessage_(outputStatus,'請先在第五步採用並保存老師修訂稿，才可匯出給學生。',false);
  }
  var paper=document.querySelector('.le-word-paper');if(paper)paper.style.setProperty('--le-word-font',lifeEduFontCssPx_(LIFE_EDU_STATE.fontSize));
}
function lifeEduSyncCardPreviewScale_(){var frame=document.getElementById('leCardPreviewFrame'),card=document.getElementById('leCardPreview');if(!frame||!card||!card.classList.contains('le-card-preview-designed'))return;var width=frame.getBoundingClientRect().width;if(width>0)card.style.setProperty('--le-card-preview-scale',String(Math.min(1,width/540)));}
function lifeEduUpdateCardFitStatus_(row,card,knownPrintOverflow){var fit=document.getElementById('leCardFitStatus');if(!row||!card||!fit)return;var messageBox=card.querySelector('.le-card-art-message'),recipientBox=card.querySelector('.le-card-art-recipient'),metrics=lifeEduCardTextFitSummary_(messageBox),body=row.correctedText||row.verifiedOcrText||'',hasRevisedText=Boolean(String(row.correctedText||'').trim()),hasContentDesign=Boolean(LIFE_EDU_STATE.cardDesign&&LIFE_EDU_STATE.cardDesign.content),fitIssues=[];if(messageBox&&(messageBox.scrollHeight>messageBox.clientHeight+2||messageBox.scrollWidth>messageBox.clientWidth+2))fitIssues.push('預覽文字超出文字區');if(recipientBox&&(recipientBox.scrollHeight>recipientBox.clientHeight+2||recipientBox.scrollWidth>recipientBox.clientWidth+2))fitIssues.push('老師名稱超出位置');var overflow=knownPrintOverflow||[],urls=LIFE_EDU_STATE.cardDesignUrls||{};if(!knownPrintOverflow&&hasRevisedText&&urls.cover&&urls.cover.url&&urls.content&&urls.content.url)overflow=lifeEduPrintOverflowIssues_(row);if(overflow.length)fitIssues.push('列印版超出：'+overflow.join('、'));var source=hasRevisedText?'老師修訂稿':body?'OCR 預覽（未採納）':'尚無文章',summary=metrics?source+'約 '+metrics.lines+'／'+metrics.maxLines+' 行，佔文字區約 '+metrics.fillPercent+'%。':!hasContentDesign?'先在第六步上載彩色內頁，之後可查看文字行數和佔位。':!messageBox?'切換至「內頁」查看右頁文章排版。':'第五步採納修訂稿後，可查看文章行數和佔位。';fit.textContent=summary+(fitIssues.length?'；'+fitIssues.join('；')+'，可調字體／文字區或修改文章。':'');}
function lifeEduBindCardPercentSlider_(inputId,stateKey,labelId,min,max,fallback){var input=document.getElementById(inputId),label=document.getElementById(labelId);if(!input||!label)return;input.addEventListener('input',function(){var requested=lifeEduCardLayoutPercent_(input.value,min,max,NaN);if(!Number.isInteger(requested))return;LIFE_EDU_STATE[stateKey]=requested;label.textContent=String(requested);lifeEduRefreshPreviews_();lifeEduPersistLocal_().then(function(saved){if(saved||LIFE_EDU_STATE[stateKey]!==requested)return;var committed=fallback;try{var snapshot=JSON.parse(LIFE_EDU_STATE.storageSnapshot||'null');if(snapshot)committed=lifeEduCardLayoutPercent_(snapshot[stateKey],min,max,fallback);}catch(error){}LIFE_EDU_STATE[stateKey]=committed;input.value=String(committed);label.textContent=String(committed);lifeEduRefreshPreviews_();});});}
function lifeEduPrintOverflowIssues_(row){var teacher=(row.teacherName||'〔收件老師待核〕')+(row.teacherTitle||''),text=String(row.correctedText||'').trim(),probe=document.createElement('section');probe.className='le-print-card-page le-print-layout-probe';probe.style.setProperty('--le-card-font',lifeEduFontCssPx_(LIFE_EDU_STATE.fontSize));probe.style.setProperty('--le-card-text-width',LIFE_EDU_STATE.cardTextWidthPct+'%');probe.style.setProperty('--le-card-text-height',LIFE_EDU_STATE.cardTextHeightPct+'%');var recipient=document.createElement('div'),message=document.createElement('div');recipient.className='le-print-recipient';recipient.textContent=teacher;message.className='le-print-message';message.textContent=text;probe.appendChild(recipient);probe.appendChild(message);document.body.appendChild(probe);var issues=[];if(message.scrollHeight>message.clientHeight+2||message.scrollWidth>message.clientWidth+2)issues.push('文章');if(recipient.scrollHeight>recipient.clientHeight+2||recipient.scrollWidth>recipient.clientWidth+2)issues.push('老師名稱');probe.remove();return issues;}
function lifeEduCardTextFitSummary_(node){if(!node||!String(node.textContent||'').trim())return null;var style=window.getComputedStyle(node),fontSize=parseFloat(style.fontSize)||16,context=document.createElement('canvas').getContext('2d');if(!context)return null;context.font=style.fontStyle+' '+(style.fontWeight||'400')+' '+fontSize+'px '+(style.fontFamily||'sans-serif');var padLeft=parseFloat(style.paddingLeft)||0,padRight=parseFloat(style.paddingRight)||0,padTop=parseFloat(style.paddingTop)||0,padBottom=parseFloat(style.paddingBottom)||0,width=Math.max(1,node.clientWidth-padLeft-padRight),height=Math.max(1,node.clientHeight-padTop-padBottom),lineHeight=parseFloat(style.lineHeight)||fontSize*1.2,lines=lifeEduCanvasWrapText_(context,node.textContent,width),maxLines=Math.max(1,Math.floor(height/lineHeight));return {lines:lines.length,maxLines:maxLines,fillPercent:Math.round(lines.length*lineHeight/height*100),overflow:lines.length*lineHeight>height+1||node.scrollWidth>node.clientWidth+2};}
function lifeEduCanvasWrapText_(context,text,maxWidth){var lines=[];String(text||'').replace(/\r\n?/g,'\n').split('\n').forEach(function(paragraph){var line='';Array.from(paragraph).forEach(function(character){var next=line+character;if(line&&context.measureText(next).width>maxWidth){lines.push(line);line=character;}else line=next;});lines.push(line);});return lines;}
function lifeEduDrawCanvasTextBox_(context,node,cardRect,scaleX,scaleY,centerVertically){var rect=node.getBoundingClientRect(),style=window.getComputedStyle(node),fontSize=parseFloat(style.fontSize)||16,fontWeight=style.fontWeight||'400',fontFamily=style.fontFamily||'sans-serif',paddingLeft=parseFloat(style.paddingLeft)||0,paddingRight=parseFloat(style.paddingRight)||0,paddingTop=parseFloat(style.paddingTop)||0,paddingBottom=parseFloat(style.paddingBottom)||0,x=(rect.left-cardRect.left)*scaleX,y=(rect.top-cardRect.top)*scaleY,width=rect.width*scaleX,height=rect.height*scaleY,innerWidth=Math.max(1,width-(paddingLeft+paddingRight)*scaleX),innerHeight=Math.max(1,height-(paddingTop+paddingBottom)*scaleY);context.save();context.beginPath();context.rect(x,y,width,height);context.clip();context.font=style.fontStyle+' '+fontWeight+' '+(fontSize*scaleX)+'px '+fontFamily;context.fillStyle=style.color||'#342c24';context.textAlign=style.textAlign==='center'?'center':'left';context.textBaseline='top';var lines=lifeEduCanvasWrapText_(context,node.textContent||'',innerWidth),lineHeight=(parseFloat(style.lineHeight)||fontSize*1.2)*scaleY,totalHeight=lines.length*lineHeight,top=y+paddingTop*scaleY;if(centerVertically)top+=Math.max(0,(innerHeight-totalHeight)/2);var textX=context.textAlign==='center'?x+(paddingLeft*scaleX)+(innerWidth/2):x+paddingLeft*scaleX;lines.forEach(function(line,index){context.fillText(line,textX,top+index*lineHeight,innerWidth);});context.restore();return totalHeight>innerHeight+1;}
function lifeEduRenderContentCardImage_(row){
  var design=LIFE_EDU_STATE.cardDesign||{},meta=design.content,text=String(row&&row.correctedText||'').trim();if(!meta)return Promise.reject(new Error('請先在第六步上載彩色內頁。'));if(!text)return Promise.reject(new Error('請先在第五步採用並保存老師修訂稿，再輸出給學生。'));
  return lifeEduAttachmentGet_(meta.id).then(function(record){if(!record||!record.blob)throw new Error('找不到彩色內頁附件。');var imageUrl=URL.createObjectURL(record.blob);return new Promise(function(resolve,reject){var image=new Image(),stage=null,canvas=null,finished=false;function cleanup_(){if(finished)return;finished=true;if(stage&&stage.parentNode)stage.parentNode.removeChild(stage);URL.revokeObjectURL(imageUrl);if(canvas){canvas.width=0;canvas.height=0;}}image.onload=function(){try{var teacher=(row.teacherName||'〔收件老師待核〕')+(row.teacherTitle||'');stage=document.createElement('article');stage.className='le-card-preview le-card-preview-designed';stage.dataset.leCardView='content';stage.style.position='fixed';stage.style.left='-10000px';stage.style.top='0';stage.style.width='540px';stage.style.visibility='hidden';stage.style.pointerEvents='none';stage.style.aspectRatio=image.naturalWidth+' / '+image.naturalHeight;stage.style.setProperty('--le-card-font',lifeEduFontCssPx_(LIFE_EDU_STATE.fontSize));stage.style.setProperty('--le-card-text-width',LIFE_EDU_STATE.cardTextWidthPct+'%');stage.style.setProperty('--le-card-text-height',LIFE_EDU_STATE.cardTextHeightPct+'%');var designImage=document.createElement('img');designImage.className='le-card-design-image';designImage.alt='';designImage.src=imageUrl;var recipient=document.createElement('div');recipient.className='le-card-art-recipient';recipient.textContent=teacher;var message=document.createElement('div');message.className='le-card-art-message';message.textContent=text;stage.appendChild(designImage);stage.appendChild(recipient);stage.appendChild(message);document.body.appendChild(stage);var cardRect=stage.getBoundingClientRect();if(message.scrollHeight>message.clientHeight+2||message.scrollWidth>message.clientWidth+2)throw new Error('文章超出內頁文字區；請調整字體、文字欄寬或文字區高度，再輸出圖片。');var factor=Math.min(1,3600/Math.max(image.naturalWidth,image.naturalHeight)),width=Math.max(1,Math.round(image.naturalWidth*factor)),height=Math.max(1,Math.round(image.naturalHeight*factor));canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;var context=canvas.getContext('2d');if(!context)throw new Error('瀏覽器未能建立圖片畫布。');context.drawImage(image,0,0,width,height);var scaleX=width/cardRect.width,scaleY=height/cardRect.height;if(lifeEduDrawCanvasTextBox_(context,recipient,cardRect,scaleX,scaleY,true))throw new Error('老師名稱超出內頁收件老師位置；請縮短老師名稱，再輸出圖片。');lifeEduDrawCanvasTextBox_(context,message,cardRect,scaleX,scaleY,false);canvas.toBlob(function(blob){cleanup_();if(blob)resolve(blob);else reject(new Error('內頁 PNG 產生失敗。'));},'image/png');}catch(error){cleanup_();reject(error);}};image.onerror=function(){cleanup_();reject(new Error('無法讀取彩色內頁圖片。'));};image.src=imageUrl;});});
}
function lifeEduOutputContentCardImage_(copy){var button=document.querySelector(copy?'[data-le-copy-content-image]':'[data-le-download-content-image]'),status=document.getElementById('leCardOutputStatus'),row=lifeEduSelected_();if(!row)return;if(button){button.disabled=true;button.textContent=copy?'準備複製…':'產生 PNG…';}if(status)lifeEduSetImportMessage_(status,'正在把目前學生的老師修訂稿放到彩色內頁…',false);function finish_(){if(button&&button.isConnected){button.textContent=copy?'複製內頁圖片':'下載內頁 PNG 給學生';button.disabled=!(LIFE_EDU_STATE.cardDesign&&LIFE_EDU_STATE.cardDesign.content&&String((lifeEduSelected_()||{}).correctedText||'').trim());}}lifeEduRenderContentCardImage_(row).then(function(blob){if((lifeEduSelected_()||{}).id!==row.id)throw new Error('學生選擇已改變；為免交錯輸出，圖片未複製或下載，請重新選取原學生再試。');var fileName=lifeEduSafeFileStem_([row.className,row.classNumber&&'第'+row.classNumber+'號','謝師恩內頁'].filter(Boolean).join('-'))+'.png';if(!copy){lifeEduDownload_(blob,fileName);if(status)lifeEduSetImportMessage_(status,'已下載 '+fileName+'；圖片供學生參考抄寫。',false);return;}if(!navigator.clipboard||typeof navigator.clipboard.write!=='function'||typeof ClipboardItem==='undefined'){lifeEduDownload_(blob,fileName);if(status)lifeEduSetImportMessage_(status,'此瀏覽器未支援複製圖片，已下載 PNG，可傳給學生抄寫。',false);return;}return navigator.clipboard.write([new ClipboardItem({'image/png':blob})]).then(function(){if(status)lifeEduSetImportMessage_(status,'內頁圖片已複製；可貼到訊息或文件給學生抄寫。',false);}).catch(function(){lifeEduDownload_(blob,fileName);if(status)lifeEduSetImportMessage_(status,'瀏覽器未允許複製圖片，已下載 PNG，可傳給學生抄寫。',false);});}).catch(function(error){if(status)lifeEduSetImportMessage_(status,error.message||'內頁圖片輸出失敗。',true);}).finally(finish_);}
function lifeEduFontCssPx_(points){return (Number(points||16)*4/3).toFixed(2)+'px';}

function lifeEduSaveCurrent_(){
  var payload=lifeEduCurrentForm_(),msg=document.getElementById('leSaveMsg');
  var countError=lifeEduCountValidationError_(payload);if(countError){if(msg){msg.textContent=countError;msg.classList.add('error');}return;}
  var button=document.querySelector('[data-le-save]');if(button){button.disabled=true;button.textContent='儲存中…';}
  try{payload.updatedAt=new Date().toISOString();payload.updatedBy='本機';LIFE_EDU_STATE.rows=LIFE_EDU_STATE.rows.map(function(r){return r.id===payload.id?Object.assign({},r,payload):r;});lifeEduPersistLocal_().then(function(saved){if(!saved)throw new Error('本機保存失敗。');LIFE_EDU_STATE.savedRows=lifeEduClone_(LIFE_EDU_STATE.rows);LIFE_EDU_STATE.dirty=false;if(button){button.disabled=false;button.textContent='儲存此學生';}lifeEduRender_();lifeEduToast_('已保存到本機瀏覽器。');}).catch(function(error){if(button){button.disabled=false;button.textContent='儲存此學生';}if(msg){msg.textContent=error.message||'本機保存失敗。';msg.classList.add('error');}});}
  catch(error){if(button){button.disabled=false;button.textContent='儲存此學生';}if(msg){msg.textContent=error.message||'本機保存失敗。';msg.classList.add('error');}}
}

function lifeEduExportData_(kind){
  if(LIFE_EDU_STATE.dirty){lifeEduToast_('目前學生有未儲存更改，請先儲存再匯出。',true);return;}
  var rows=LIFE_EDU_STATE.rows||[],meta=LIFE_EDU_STATE.meta||{};
  if(kind==='zip'){lifeEduDownloadBackupZip_();return;}
  if(kind==='json'){lifeEduDownload_(new Blob([JSON.stringify(lifeEduLocalBackup_(),null,2)],{type:'application/json;charset=utf-8'}),'謝師恩本機備份.json');return;}
  var headers=['班別','班號','正式學號','中文姓名OCR','英文姓名','性別','社別','所屬小學','OCR姓名候選','OCR老師候選','OCR小學候選','收件老師','老師職銜','應交張數','紙本已收張數','完成遞交','掃描頁數','收稿狀態','文章狀態','原始OCR','核對後OCR','老師修訂稿','錯字已核對','文句已核對','格式已核對','待學生澄清','OCR疑點','批改備註','原稿連結','最後更新','更新者'];
  var keys=['className','classNumber','studentNumber','nameZh','nameEn','gender','house','primarySchool','ocrStudentName','ocrTeacherName','ocrPrimarySchool','teacherName','teacherTitle','expectedSheets','physicalReceived','_submission','scannedSheets','_receipt','reviewStatus','sourceOcrText','verifiedOcrText','correctedText','checkSpelling','checkFlow','checkFormat','studentFollowup','ocrNote','teacherNote','sourceUrl','updatedAt','updatedBy'];
  var lines=[headers.map(lifeEduCsvCell_).join(',')];rows.forEach(function(row){lines.push(keys.map(function(key){var v=key==='_receipt'?lifeEduStatus_(row):key==='_submission'?lifeEduSubmissionStatus_(row):row[key];return lifeEduCsvCell_(v);}).join(','));});
  lifeEduDownload_(new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),'謝師恩文章核對資料.csv');
}
function lifeEduCsvCell_(value){var s=String(value==null?'':value);if(/^\s*[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
function lifeEduDownloadCsvTemplate_(){
  var headers=['班別','班號','正式學號','中文姓名OCR','英文姓名','性別','社別','所屬小學','OCR姓名候選','OCR老師候選','OCR小學候選','收件老師','老師職銜','應交張數','紙本已收張數','掃描頁數','文章狀態','原始OCR','核對後OCR','老師修訂稿','錯字已核對','文句已核對','格式已核對','待學生澄清','OCR疑點','批改備註','原稿連結'];
  lifeEduDownload_(new Blob(['\ufeff'+headers.map(lifeEduCsvCell_).join(',')+'\r\n'],{type:'text/csv;charset=utf-8'}),'謝師恩名單及文章匯入欄位.csv');
}
function lifeEduDownload_(blob,name){var url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();window.setTimeout(function(){URL.revokeObjectURL(url);},1500);}

function lifeEduOpenAttachmentDb_(){
  return new Promise(function(resolve,reject){if(!window.indexedDB){reject(new Error('此瀏覽器不支援 IndexedDB，無法保存 PDF 附件。'));return;}var request=indexedDB.open(LIFE_EDU_DB_NAME,1);request.onupgradeneeded=function(){var db=request.result;if(!db.objectStoreNames.contains(LIFE_EDU_DB_STORE))db.createObjectStore(LIFE_EDU_DB_STORE,{keyPath:'id'});};request.onsuccess=function(){resolve(request.result);};request.onerror=function(){reject(request.error||new Error('無法開啟本機附件資料庫。'));};});
}
function lifeEduAttachmentPut_(record){return lifeEduAttachmentPutMany_([record]).then(function(){return record;});}
function lifeEduAttachmentPutMany_(records){return lifeEduOpenAttachmentDb_().then(function(db){return new Promise(function(resolve,reject){var tx=db.transaction(LIFE_EDU_DB_STORE,'readwrite'),store=tx.objectStore(LIFE_EDU_DB_STORE);records.forEach(function(record){store.put(record);});tx.oncomplete=function(){db.close();resolve(records);};tx.onabort=tx.onerror=function(){var error=tx.error||new Error('掃描附件未能保存。');db.close();reject(error);};});});}
function lifeEduAttachmentGet_(id){return lifeEduOpenAttachmentDb_().then(function(db){return new Promise(function(resolve,reject){var tx=db.transaction(LIFE_EDU_DB_STORE,'readonly'),request=tx.objectStore(LIFE_EDU_DB_STORE).get(id);request.onsuccess=function(){db.close();resolve(request.result||null);};request.onerror=function(){db.close();reject(request.error||new Error('無法讀取本機掃描附件。'));};});});}
function lifeEduAttachmentAll_(){return lifeEduOpenAttachmentDb_().then(function(db){return new Promise(function(resolve,reject){var tx=db.transaction(LIFE_EDU_DB_STORE,'readonly'),request=tx.objectStore(LIFE_EDU_DB_STORE).getAll();request.onsuccess=function(){db.close();resolve(request.result||[]);};request.onerror=function(){db.close();reject(request.error||new Error('無法列出本機掃描附件。'));};});});}
function lifeEduAttachmentDelete_(id){return lifeEduOpenAttachmentDb_().then(function(db){return new Promise(function(resolve,reject){var tx=db.transaction(LIFE_EDU_DB_STORE,'readwrite');tx.objectStore(LIFE_EDU_DB_STORE).delete(id);tx.oncomplete=function(){db.close();resolve();};tx.onerror=function(){db.close();reject(tx.error||new Error('無法清除未使用附件。'));};});});}
function lifeEduAttachmentDeleteMany_(ids){if(!ids.length)return Promise.resolve();return lifeEduOpenAttachmentDb_().then(function(db){return new Promise(function(resolve,reject){var tx=db.transaction(LIFE_EDU_DB_STORE,'readwrite'),store=tx.objectStore(LIFE_EDU_DB_STORE);ids.forEach(function(id){store.delete(id);});tx.oncomplete=function(){db.close();resolve();};tx.onabort=tx.onerror=function(){var error=tx.error||new Error('無法回復本機附件。');db.close();reject(error);};});});}
function lifeEduCleanOrphanAttachments_(){
  var status=document.getElementById('leAttachmentCleanupStatus'),button=document.querySelector('[data-le-clean-orphans]');
  if(lifeEduAnyScanImportLocked_()){if(status)lifeEduSetImportMessage_(status,'掃描或備份匯入仍在進行；完成後再清理附件。',true);return;}
  if(!lifeEduAcquireScanImport_('__attachment_cleanup__')){if(status)lifeEduSetImportMessage_(status,'本機掃描／附件操作仍在進行；完成後再清理。',true);return;}
  var expectedSnapshot=localStorage.getItem(LIFE_EDU_LOCAL_KEY);if(button)button.disabled=true;if(status)status.textContent='正在檢查本機附件…';
  var work=function(){var referenced=lifeEduRequiredAttachmentIds_(lifeEduLocalBackup_());return lifeEduAttachmentAll_().then(function(records){var orphans=records.filter(function(record){return record&&record.id&&referenced.indexOf(record.id)<0;}),bytes=orphans.reduce(function(sum,record){return sum+(Number(record.blob&&record.blob.size)||0);},0);if(!orphans.length){if(status)status.textContent='目前沒有未被記錄引用的附件。';return;}var names=orphans.slice(0,3).map(function(record){return record.fileName||'附件';}),sample=names.join('、')+(orphans.length>3?' 等':'');if(!window.confirm('找到 '+orphans.length+' 個未被目前名冊、逐頁工作區、掃描版本或色稿引用的本機附件（'+(bytes/1024/1024).toFixed(1)+' MiB），例如：'+sample+'。刪除後不能由此瀏覽器復原；確定清理？')){if(status)status.textContent='已取消清理；附件保留。';return;}return orphans.reduce(function(chain,record){return chain.then(function(){return lifeEduAttachmentDelete_(record.id);});},Promise.resolve()).then(function(){if(status)status.textContent='已清理 '+orphans.length+' 個未引用附件；目前記錄和版本均保留。';});});};
  lifeEduWithCrossTabWriteLock_(work,status,'另一個分頁正在處理本機資料；完成後再清理附件。',expectedSnapshot).catch(function(error){if(status)lifeEduSetImportMessage_(status,error.message||'無法清理未引用附件。',true);}).finally(function(){lifeEduReleaseScanImport_('__attachment_cleanup__');if(button)button.disabled=false;});
}
function lifeEduNewFileId_(){var random=window.crypto&&crypto.getRandomValues?Array.from(crypto.getRandomValues(new Uint8Array(8))).map(function(n){return n.toString(16).padStart(2,'0');}).join(''):Math.random().toString(36).slice(2);return 'lefile-'+Date.now().toString(36)+'-'+random;}
function lifeEduSafeFileStem_(name){return String(name||'謝師恩文章').replace(/\.[^.]+$/,'').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,100)||'謝師恩文章';}
function lifeEduDownloadAttachment_(id){lifeEduAttachmentGet_(id).then(function(record){if(!record||!record.blob)throw new Error('找不到本機附件；如從 JSON 文字備份還原，請改用完整備份 ZIP。');lifeEduDownload_(record.blob,record.fileName||'謝師恩掃描.pdf');}).catch(function(error){lifeEduToast_(error.message||String(error),true);});}
function lifeEduCreateBackupZip_(){
  if(typeof PizZip==='undefined')return Promise.reject(new Error('ZIP 元件未載入，請檢查網絡後重新整理。'));
  if(LIFE_EDU_STATE.dirty)return Promise.reject(new Error('目前學生有未儲存更改，請先按「儲存此學生」。'));
  if(lifeEduAnyScanImportLocked_())return Promise.reject(new Error('掃描或匯入仍在處理；完成後再建立備份。'));
  var initialSnapshot=localStorage.getItem(LIFE_EDU_LOCAL_KEY);
  if(LIFE_EDU_STATE.externalStorageChanged||initialSnapshot!==LIFE_EDU_STATE.storageSnapshot)return Promise.reject(new Error('另一個分頁已更新本機記錄；請重新載入後再建立備份。'));
  var maxZipBytes=200*1024*1024,maxAttachmentBytes=190*1024*1024,backup=lifeEduLocalBackup_(),requiredIds=lifeEduRequiredAttachmentIds_(backup),zip=new PizZip();
  return lifeEduAttachmentAll_().then(function(allRecords){var byId=Object.create(null);allRecords.forEach(function(record){byId[record.id]=record;});var missing=requiredIds.filter(function(id){return !byId[id]||!byId[id].blob;});if(missing.length)throw new Error('有 '+missing.length+' 個記錄所需附件找不到；為免產生不完整備份，已停止匯出。');var records=requiredIds.map(function(id){return byId[id];}),attachmentBytes=records.reduce(function(sum,record){return sum+(Number(record.blob.size)||0);},0);if(attachmentBytes>maxAttachmentBytes)throw new Error('必要附件合共超過 190 MiB，完整 ZIP 未能安全產生；請先分別下載大型掃描附件，再匯出 JSON 備份。');zip.file('backup.json',JSON.stringify(backup,null,2));var manifest=records.map(function(record){return {id:record.id,fileName:record.fileName||'附件',mimeType:record.mimeType||'application/octet-stream',createdAt:record.createdAt||''};});zip.file('attachments/index.json',JSON.stringify(manifest,null,2));return records.reduce(function(chain,record){return chain.then(function(){return record.blob.arrayBuffer().then(function(buffer){zip.file('attachments/'+record.id,new Uint8Array(buffer));});});},Promise.resolve());}).then(function(){if(lifeEduAnyScanImportLocked_()||LIFE_EDU_STATE.dirty||LIFE_EDU_STATE.externalStorageChanged||localStorage.getItem(LIFE_EDU_LOCAL_KEY)!==initialSnapshot)throw new Error('建立備份期間本機記錄有變更；沒有上載，請重新整理後再試。');return zip.generate({type:'blob',compression:'DEFLATE',compressionOptions:{level:4}});}).then(function(blob){if(blob.size>maxZipBytes)throw new Error('完整備份 ZIP 超過 200 MiB，未能產生；請先分別下載大型掃描附件，再匯出 JSON 備份。');return blob;});
}
function lifeEduDownloadBackupZip_(){
  lifeEduToast_('正在整理本機記錄、掃描附件及色稿的完整備份…');
  lifeEduCreateBackupZip_().then(function(blob){lifeEduDownload_(blob,'謝師恩完整本機備份.zip');lifeEduToast_('完整備份 ZIP 已下載，內含目前記錄引用的掃描附件及色稿。');}).catch(function(error){lifeEduToast_(error.message||'完整備份 ZIP 產生失敗。',true);});
}
function lifeEduRequiredAttachmentIds_(backup){var ids=[];(backup.rows||[]).forEach(function(row){(Array.isArray(row.scanVersions)?row.scanVersions:[]).forEach(function(item){if(item&&item.id&&ids.indexOf(item.id)<0)ids.push(item.id);});(Array.isArray(row.articlePageRecords)?row.articlePageRecords:[]).forEach(function(item){if(item&&item.attachmentId&&ids.indexOf(item.attachmentId)<0)ids.push(item.attachmentId);});});if(backup.pdfWorkspace&&backup.pdfWorkspace.sourceFileId&&ids.indexOf(backup.pdfWorkspace.sourceFileId)<0)ids.push(backup.pdfWorkspace.sourceFileId);var design=lifeEduNormalizeCardDesign_(backup.cardDesign);if(design)['cover','content'].forEach(function(side){var image=design[side];if(image&&image.id&&ids.indexOf(image.id)<0)ids.push(image.id);});return ids;}
function lifeEduRemapBackupAttachmentIds_(backup,idMap){
  (backup.rows||[]).forEach(function(row){
    (row.scanVersions||[]).forEach(function(version){if(idMap[version.id])version.id=idMap[version.id];});
    (row.articlePageRecords||[]).forEach(function(page){if(idMap[page.attachmentId])page.attachmentId=idMap[page.attachmentId];});
  });
  if(backup.pdfWorkspace){if(idMap[backup.pdfWorkspace.sourceFileId])backup.pdfWorkspace.sourceFileId=idMap[backup.pdfWorkspace.sourceFileId];(backup.pdfWorkspace.pages||[]).forEach(function(page){if(idMap[page.importedAttachmentId])page.importedAttachmentId=idMap[page.importedAttachmentId];if(idMap[page.replacesImportedAttachmentId])page.replacesImportedAttachmentId=idMap[page.replacesImportedAttachmentId];});}
  if(backup.cardDesign)['cover','content'].forEach(function(side){var image=backup.cardDesign[side];if(image&&idMap[image.id])image.id=idMap[image.id];});
}
function lifeEduDriveRestoreBlockReason_(ignoreScanLock){
  var countError=lifeEduCountValidationError_(lifeEduCurrentForm_());
  if(countError)return countError+' 更正後才可載入雲端備份。';
  if(LIFE_EDU_STATE.dirty)return '目前學生有未儲存更改；請先按「儲存此學生」，再載入雲端備份。';
  if(LIFE_EDU_STATE.externalStorageChanged||localStorage.getItem(LIFE_EDU_LOCAL_KEY)!==LIFE_EDU_STATE.storageSnapshot)return '另一個分頁已更新本機記錄；請重新載入後再載入雲端備份。';
  if(!ignoreScanLock&&lifeEduAnyScanImportLocked_())return '掃描或匯入仍在處理；完成後再載入雲端備份。';
  return '';
}
function lifeEduRestoreBackupZipFile_(file,messageNode){
  var initialBlock=lifeEduDriveRestoreBlockReason_(false);
  if(initialBlock){lifeEduSetImportMessage_(messageNode,initialBlock,true);return Promise.resolve(false);}
  if(!lifeEduAcquireScanImport_('__backup_restore__')){lifeEduSetImportMessage_(messageNode,'掃描匯入仍在進行；完成後再還原完整備份。',true);return Promise.resolve(false);}
  var expectedSnapshot=localStorage.getItem(LIFE_EDU_LOCAL_KEY);
  if(typeof PizZip==='undefined'){lifeEduSetImportMessage_(messageNode,'ZIP 元件未載入，請檢查網絡後重新整理。',true);lifeEduReleaseScanImport_('__backup_restore__');return Promise.resolve(false);}
  var restoreSucceeded=false;
  return lifeEduWithCrossTabWriteLock_(function(){
    var createdIds=[],previous=null,previousSelectedId=LIFE_EDU_STATE.selectedId,stateApplied=false,persisted=false;
    return Promise.resolve().then(function(){return file.arrayBuffer();}).then(function(buffer){
      var zip=new PizZip(buffer),backupFile=zip.file('backup.json'),manifestFile=zip.file('attachments/index.json');
      if(!backupFile)throw new Error('ZIP 內找不到 backup.json。');
      var backup=lifeEduClone_(JSON.parse(backupFile.asText()));lifeEduValidateBackup_(backup);
      var manifest=manifestFile?JSON.parse(manifestFile.asText()):[],byId=Object.create(null);
      if(!Array.isArray(manifest))throw new Error('ZIP 附件清單格式錯誤。');
      manifest.forEach(function(item){if(!item||typeof item.id!=='string'||!/^lefile-[a-z0-9-]{8,80}$/i.test(item.id)||byId[item.id])throw new Error('ZIP 附件清單有重複或無效識別碼。');byId[item.id]=item;});
      var items=lifeEduRequiredAttachmentIds_(backup);if(items.some(function(id){return !/^lefile-[a-z0-9-]{8,80}$/i.test(String(id||''));}))throw new Error('備份內有無效附件識別碼，已停止還原。');var missing=items.filter(function(id){return !byId[id]||!zip.file('attachments/'+id);});
      if(missing.length)throw new Error('完整備份缺少 '+missing.length+' 個必要附件，已停止還原。');
      var restoreBlock=lifeEduDriveRestoreBlockReason_(true);if(restoreBlock)throw new Error(restoreBlock);
      if(!window.confirm('完整備份 ZIP 會取代目前全部學生記錄、設定及逐頁工作區，並匯入其中的掃描附件和色稿。建議先下載現有完整備份。確定還原？')){lifeEduSetImportMessage_(messageNode,'已取消還原；現有記錄保留。',false);return false;}
      restoreBlock=lifeEduDriveRestoreBlockReason_(true);if(restoreBlock)throw new Error(restoreBlock);
      previous=lifeEduLocalBackup_();var idMap=Object.create(null),records=[];
      items.forEach(function(oldId){idMap[oldId]=lifeEduNewFileId_();});
      lifeEduRemapBackupAttachmentIds_(backup,idMap);lifeEduValidateBackup_(backup);
      items.forEach(function(oldId){var meta=byId[oldId],entry=zip.file('attachments/'+oldId),mime=String(meta.mimeType||'application/octet-stream').slice(0,120),bytes=entry.asUint8Array();records.push({id:idMap[oldId],fileName:String(meta.fileName||'附件').slice(0,240),mimeType:mime,createdAt:String(meta.createdAt||new Date().toISOString()).slice(0,50),blob:new Blob([bytes],{type:mime})});});
      return lifeEduAttachmentPutMany_(records).then(function(){createdIds=records.map(function(record){return record.id;});restoreBlock=lifeEduDriveRestoreBlockReason_(true);if(restoreBlock)throw new Error(restoreBlock);stateApplied=true;lifeEduApplyBackup_(backup);LIFE_EDU_STATE.selectedId=LIFE_EDU_STATE.rows[0]&&LIFE_EDU_STATE.rows[0].id||'';LIFE_EDU_STATE.dirty=false;if(!lifeEduPersistLocalNow_())throw new Error('本機儲存空間不足，還原未完成。');persisted=true;createdIds=[];LIFE_EDU_STATE.savedRows=lifeEduClone_(LIFE_EDU_STATE.rows);lifeEduRender_();var current=document.getElementById('leImportMessage'),panel=document.getElementById('leImportPanel');if(panel)panel.open=true;lifeEduSetImportMessage_(current,'完整備份 ZIP 及 '+items.length+' 個掃描／色稿附件已還原。',false);lifeEduToast_('完整備份 ZIP 已還原。');restoreSucceeded=true;return true;});
    }).catch(function(error){
      if(stateApplied&&!persisted&&previous){try{lifeEduApplyBackup_(previous);LIFE_EDU_STATE.selectedId=previousSelectedId;LIFE_EDU_STATE.savedRows=lifeEduClone_(LIFE_EDU_STATE.rows);LIFE_EDU_STATE.dirty=false;lifeEduRender_();}catch(restoreStateError){error=new Error((error.message||'完整備份 ZIP 還原失敗。')+'；恢復原畫面失敗：'+(restoreStateError.message||'請重新載入頁面。'));}}
      if(persisted||!createdIds.length)throw error;
      return lifeEduAttachmentDeleteMany_(createdIds).then(function(){throw error;},function(rollbackError){throw new Error((error.message||'完整備份 ZIP 還原失敗。')+' 附件回復失敗：'+(rollbackError.message||'請保留現有完整備份並檢查本機儲存。'));});
    });
  },messageNode,'另一個分頁正在處理本機資料；完成後再還原。',expectedSnapshot).then(function(acquired){return Boolean(acquired&&restoreSucceeded);}).finally(function(){lifeEduReleaseScanImport_('__backup_restore__');});
}
function lifeEduGetPdfPage_(pageNumber){var pages=LIFE_EDU_STATE.pdfWorkspace&&LIFE_EDU_STATE.pdfWorkspace.pages||[];return pages.filter(function(page){return Number(page.pageNumber)===Number(pageNumber);})[0]||null;}
function lifeEduNormalizeClassName_(value){var normalized=String(value||'').trim().toUpperCase().replace(/[\s.()（）]/g,'').replace(/^S(?=\d)/,'');return /^\d+[A-Z]$/.test(normalized)?normalized:'';}
function lifeEduValidClassNumber_(value){var raw=String(value==null?'':value).trim();return /^\d{1,3}$/.test(raw)&&Number(raw)>=1&&Number(raw)<=999;}
function lifeEduStudentId_(className,classNumber){var number=String(Number(classNumber));return String(className).trim()+'-'+(number.length<2?'0'+number:number);}
function lifeEduGetPdfSourceBlob_(){var workspace=LIFE_EDU_STATE.pdfWorkspace;if(!workspace||!workspace.sourceFileId)return Promise.reject(new Error('請先載入合併 PDF。'));return lifeEduAttachmentGet_(workspace.sourceFileId).then(function(record){if(!record||!record.blob)throw new Error('找不到本機原始 PDF；請重新選擇該 PDF。');return record.blob;});}
function lifeEduInputFileType_(file){var name=String(file&&file.name||'').toLowerCase(),type=String(file&&file.type||'').toLowerCase();if(/\.pdf$/.test(name)||type==='application/pdf')return 'application/pdf';if(/\.jpe?g$/.test(name)||type==='image/jpeg')return 'image/jpeg';if(/\.png$/.test(name)||type==='image/png')return 'image/png';return '';}
function lifeEduImageBytesForPdf_(file,type){
  return new Promise(function(resolve,reject){var url=URL.createObjectURL(file),image=new Image(),canvas=null,finished=false;function finish(error,value){if(finished)return;finished=true;URL.revokeObjectURL(url);if(canvas){canvas.width=0;canvas.height=0;}if(error)reject(error);else resolve(value);}
    image.onload=function(){try{var width=image.naturalWidth,height=image.naturalHeight;if(!width||!height)throw new Error(file.name+' 的影像尺寸無法讀取。');var scale=Math.min(1,5000/Math.max(width,height));canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));var context=canvas.getContext('2d');if(!context)throw new Error('瀏覽器無法處理 '+file.name+'。');context.drawImage(image,0,0,canvas.width,canvas.height);var outputType=type==='image/jpeg'?'image/jpeg':'image/png';canvas.toBlob(function(blob){if(!blob){finish(new Error('無法整理 '+file.name+' 的影像方向。'));return;}blob.arrayBuffer().then(function(buffer){finish(null,new Uint8Array(buffer));},function(error){finish(error);});},outputType,type==='image/jpeg'?0.94:undefined);}catch(error){finish(error);}};
    image.onerror=function(){finish(new Error(file.name+' 影像無法解碼。'));};image.src=url;
  });
}
function lifeEduBuildCombinedPdf_(files,statusNode){
  var totalBytes=files.reduce(function(sum,file){return sum+(Number(file.size)||0);},0);if(totalBytes>100*1024*1024)return Promise.reject(new Error('所選檔案總容量超過 100 MB，請分批處理。'));
  if(files.some(function(file){return !lifeEduInputFileType_(file);}))return Promise.reject(new Error('只接受 PDF、JPG 或 PNG 檔案。'));
  if(files.length===1&&lifeEduInputFileType_(files[0])==='application/pdf')return files[0].arrayBuffer().then(function(buffer){return PDFLib.PDFDocument.load(new Uint8Array(buffer)).then(function(doc){var count=doc.getPageCount();if(!count||count>300)throw new Error('PDF 頁數必須介乎 1 至 300 頁。');return {bytes:new Uint8Array(buffer),pageSourceNames:Array.from({length:count},function(){return files[0].name;}),pageCount:count};});});
  return PDFLib.PDFDocument.create().then(function(output){
    var pageSourceNames=[],pageCount=0;
    function appendPdf_(file){
      return file.arrayBuffer().then(function(buffer){return PDFLib.PDFDocument.load(new Uint8Array(buffer));}).then(function(source){
        var count=source.getPageCount();if(!count)throw new Error(file.name+' 沒有頁面。');if(pageCount+count>300)throw new Error('所選檔案合計超過 300 頁，請分批處理。');
        return output.copyPages(source,Array.from({length:count},function(_,i){return i;})).then(function(pages){pages.forEach(function(page){output.addPage(page);pageSourceNames.push(file.name);});pageCount+=count;});
      });
    }
    function appendImage_(file,type){
      return lifeEduImageBytesForPdf_(file,type).then(function(imageBytes){return type==='image/jpeg'?output.embedJpg(imageBytes):output.embedPng(imageBytes);}).then(function(image){
        var imageWidth=Number(image.width),imageHeight=Number(image.height);if(!imageWidth||!imageHeight)throw new Error(file.name+' 的影像尺寸無法讀取。');if(pageCount>=300)throw new Error('所選檔案合計超過 300 頁，請分批處理。');
        var scale=Math.min(1,1440/Math.max(imageWidth,imageHeight)),width=imageWidth*scale,height=imageHeight*scale,page=output.addPage([width,height]);page.drawImage(image,{x:0,y:0,width:width,height:height});pageSourceNames.push(file.name);pageCount++;
      });
    }
    return files.reduce(function(chain,file,index){return chain.then(function(){var type=lifeEduInputFileType_(file);if(statusNode)statusNode.textContent='正在處理 '+(index+1)+' / '+files.length+'：'+file.name;return type==='application/pdf'?appendPdf_(file):appendImage_(file,type);});},Promise.resolve()).then(function(){
      if(!pageCount)throw new Error('沒有可匯入的頁面。');return output.save().then(function(bytes){return {bytes:bytes,pageSourceNames:pageSourceNames,pageCount:pageCount};});
    });
  });
}
function lifeEduHandlePdfFile_(event){
  var files=Array.prototype.slice.call(event.target.files||[]),status=document.getElementById('lePdfImportStatus');if(!files.length)return;
  if(typeof PDFLib==='undefined'){lifeEduSetImportMessage_(status,'PDF 拆頁元件未載入。',true);event.target.value='';return;}
  if(lifeEduAnyScanImportLocked_()){lifeEduSetImportMessage_(status,'掃描或備份操作尚未完成；完成後才可替換逐頁 PDF。',true);event.target.value='';return;}
  var expectedSnapshot=localStorage.getItem(LIFE_EDU_LOCAL_KEY);
  var work=function(){
    if(!lifeEduCommitDirtyBeforeAttachment_(status))return;
    var old=LIFE_EDU_STATE.pdfWorkspace;
    if(old&&old.pages&&old.pages.some(function(page){return page.importing;}))throw new Error('逐頁匯入尚未完成；完成後才可替換 PDF。');
    if(old&&old.pages&&old.pages.some(function(page){return page.ocrText||page.assignedStudentId||page.importedAt;})){if(!window.confirm('目前逐頁工作區已有 OCR 或配對。重新從第三步匯入會清除此工作區的頁面配對；已匯入學生文章及附件會保留。建議先匯出配對 JSON。繼續？'))return;}
    lifeEduSetImportMessage_(status,'正在整理所選文件…',false);
    return lifeEduBuildCombinedPdf_(files,status).then(function(result){var id=lifeEduNewFileId_(),fileName=files.map(function(file){return file.name;}).join('、').slice(0,240),record={id:id,fileName:fileName,mimeType:'application/pdf',createdAt:new Date().toISOString(),blob:new Blob([result.bytes],{type:'application/pdf'})};return lifeEduAttachmentPut_(record).then(function(){var previous=LIFE_EDU_STATE.pdfWorkspace;LIFE_EDU_STATE.pdfWorkspace={sourceFileId:id,fileName:fileName,pageCount:result.pageCount,pages:Array.from({length:result.pageCount},function(_,i){return {pageNumber:i+1,sourceFileName:result.pageSourceNames[i]||fileName,className:'',classNumber:'',studentName:'',primarySchool:'',teacherName:'',ocrText:'',uncertainNotes:'',assignedStudentId:'',importedAt:'',importedAttachmentId:'',replacesImportedAttachmentId:'',replacingImport:false};}),updatedAt:new Date().toISOString()};LIFE_EDU_STATE.pdfPageView='grid';LIFE_EDU_STATE.pdfPageViewPage=1;lifeEduInvalidatePdfRenderCache_();if(!lifeEduPersistLocalNow_()){LIFE_EDU_STATE.pdfWorkspace=previous;lifeEduInvalidatePdfRenderCache_();return lifeEduAttachmentDelete_(id).then(function(){throw new Error('逐頁工作區未能保存；已保留原有工作區。');});}LIFE_EDU_STATE.savedRows=lifeEduClone_(LIFE_EDU_STATE.rows);lifeEduRender_();var panel=document.getElementById('leImportPanel');if(panel)panel.open=true;lifeEduSetImportMessage_(document.getElementById('lePdfImportStatus'),'已載入 '+files.length+' 個來源檔案，共 '+result.pageCount+' 頁；請在第三步逐頁配對學生。',false);});});
  };
  lifeEduWithCrossTabWriteLock_(work,status,'另一個分頁正在處理本機資料；完成後再載入 PDF。',expectedSnapshot).catch(function(error){lifeEduSetImportMessage_(status,error.message||'無法讀取 PDF。',true);}).finally(function(){event.target.value='';});
}
function lifeEduHandleReplaceAllPdfFile_(event){
  var files=Array.prototype.slice.call(event.target.files||[]),status=document.getElementById('lePdfStatus'),workspace=LIFE_EDU_STATE.pdfWorkspace;if(!files.length)return;
  if(typeof PDFLib==='undefined'){lifeEduSetImportMessage_(status,'PDF 替換元件未載入。',true);event.target.value='';return;}
  if(lifeEduAnyScanImportLocked_()){lifeEduSetImportMessage_(status,'掃描或備份操作尚未完成；完成後才可替換初稿。',true);event.target.value='';return;}
  if(!workspace){lifeEduSetImportMessage_(status,'請先在第三步匯入 PDF 初稿。',true);event.target.value='';return;}
  if(workspace.pages.some(function(page){return page.importing;})){lifeEduSetImportMessage_(status,'逐頁匯入尚未完成；完成後才可替換初稿。',true);event.target.value='';return;}
  var hasImported=workspace.pages.some(function(page){return Boolean(page.importedAt);});
  if(hasImported&&!window.confirm('整批替換會將所有頁面重新設為待 OCR。已匯入頁會保留學生的原文章和附件；完成新 OCR 後，可逐頁更新相同學生的原頁附件。繼續？')){event.target.value='';return;}
  var expectedSnapshot=localStorage.getItem(LIFE_EDU_LOCAL_KEY),previous=lifeEduClone_(workspace);
  var work=function(){
    if(!lifeEduCommitDirtyBeforeAttachment_(status))return;
    if(LIFE_EDU_STATE.pdfWorkspace!==workspace)throw new Error('逐頁工作區已改變；請重新載入頁面後再替換。');
    if(hasImported&&workspace.pages.some(function(page){return Boolean(page.importedAt)&&!lifeEduFindImportedPageTarget_(page);}))throw new Error('至少一個已匯入頁找不到唯一的學生附件關聯；為免覆寫錯誤，請到第五步以「更新內容」處理該生掃描。');
    lifeEduSetImportMessage_(status,'正在整理替換初稿…',false);
    return lifeEduBuildCombinedPdf_(files,status).then(function(result){
      if(hasImported&&result.pageCount!==workspace.pageCount)throw new Error('目前有已匯入頁；整批替換必須保持 '+workspace.pageCount+' 頁，才可保留逐頁與學生的關聯。請改用逐頁替換。');
      var id=lifeEduNewFileId_(),fileName=files.map(function(file){return file.name;}).join('、').slice(0,240),record={id:id,fileName:fileName,mimeType:'application/pdf',createdAt:new Date().toISOString(),blob:new Blob([result.bytes],{type:'application/pdf'})};
      return lifeEduAttachmentPut_(record).then(function(){
        var oldByPage=Object.create(null);workspace.pages.forEach(function(page){oldByPage[page.pageNumber]=page;});
        var newPages=Array.from({length:result.pageCount},function(_,i){var number=i+1,old=result.pageCount===workspace.pageCount?oldByPage[number]:null,page={pageNumber:number,sourceFileName:result.pageSourceNames[i]||fileName,className:'',classNumber:'',studentName:'',primarySchool:'',teacherName:'',ocrText:'',uncertainNotes:'',assignedStudentId:old&&old.assignedStudentId||'',importedAt:'',importedAttachmentId:'',replacesImportedAttachmentId:'',replacingImport:false};
          if(old&&old.importedAt){var target=lifeEduFindImportedPageTarget_(old);page.assignedStudentId=old.assignedStudentId;page.importedAt=old.importedAt;page.importedAttachmentId=target.articleRecord.attachmentId;page.replacesImportedAttachmentId=target.articleRecord.attachmentId;page.replacingImport=true;}
          return page;
        });
        LIFE_EDU_STATE.pdfWorkspace={sourceFileId:id,fileName:fileName,pageCount:result.pageCount,pages:newPages,updatedAt:new Date().toISOString()};LIFE_EDU_STATE.pdfPageView='grid';LIFE_EDU_STATE.pdfPageViewPage=1;lifeEduInvalidatePdfRenderCache_();
        if(!lifeEduPersistLocalNow_()){LIFE_EDU_STATE.pdfWorkspace=workspace;lifeEduInvalidatePdfRenderCache_();return lifeEduAttachmentDelete_(id).then(function(){throw new Error('本機記錄未能保存；原有工作區和配對已保留。');});}
        LIFE_EDU_STATE.savedRows=lifeEduClone_(LIFE_EDU_STATE.rows);LIFE_EDU_STATE.dirty=false;lifeEduRender_();var panel=document.getElementById('leImportPanel');if(panel)panel.open=true;lifeEduSetImportMessage_(document.getElementById('lePdfStatus'),'已整批替換為 '+result.pageCount+' 頁；原有配對已保留，請逐頁重做 OCR。',false);
      });
    });
  };
  lifeEduWithCrossTabWriteLock_(work,status,'另一個分頁正在處理本機資料；完成後再替換初稿。',expectedSnapshot).catch(function(error){lifeEduSetImportMessage_(status,error.message||'整批替換失敗。',true);}).finally(function(){event.target.value='';});
}
function lifeEduFindImportedPageTarget_(page){
  if(!page||!page.assignedStudentId)return null;var row=LIFE_EDU_STATE.rows.filter(function(item){return item.id===page.assignedStudentId;})[0];if(!row)return null;
  var records=Array.isArray(row.articlePageRecords)?row.articlePageRecords:[],attachmentId=String(page.replacesImportedAttachmentId||page.importedAttachmentId||'');
  var matches=attachmentId?records.filter(function(item){return item&&item.attachmentId===attachmentId;}):records.filter(function(item){return item&&Number(item.pageNumber)===Number(page.pageNumber)&&String(item.sourceFileName||'')===String(page.sourceFileName||'');});
  if(matches.length!==1)return null;var articleRecord=matches[0];if(!attachmentId)attachmentId=articleRecord.attachmentId;
  var versions=Array.isArray(row.scanVersions)?row.scanVersions:[],activeVersions=versions.filter(function(item){return item&&item.id===attachmentId&&item.active;});if(activeVersions.length!==1)return null;
  return {row:row,articleRecord:articleRecord,version:activeVersions[0],attachmentId:attachmentId};
}
function lifeEduReplacePdfPageBlob_(sourceBlob,replacementBytes,pageNumber,pageCount){
  return Promise.all([sourceBlob.arrayBuffer(),Promise.resolve(replacementBytes)]).then(function(buffers){return Promise.all([PDFLib.PDFDocument.load(new Uint8Array(buffers[0])),PDFLib.PDFDocument.load(new Uint8Array(buffers[1]))]);}).then(function(docs){var source=docs[0],replacement=docs[1];if(source.getPageCount()!==pageCount)throw new Error('原稿頁數與工作區不一致；請重新載入後再替換。');if(replacement.getPageCount()!==1)throw new Error('替換檔必須剛好一頁。');var output=PDFLib.PDFDocument.create();return Promise.resolve(output).then(function(out){var chain=Promise.resolve();for(var index=0;index<pageCount;index++)(function(pageIndex){chain=chain.then(function(){var doc=pageIndex===pageNumber-1?replacement:source;return out.copyPages(doc,[pageIndex===pageNumber-1?0:pageIndex]).then(function(copied){out.addPage(copied[0]);});});})(index);return chain.then(function(){return out.save();});});});
}
function lifeEduHandleReplacePageFile_(event){
  var input=event.target,file=input.files&&input.files[0],pageNumber=Number(input.dataset.leReplacePageFile),page=lifeEduGetPdfPage_(pageNumber),workspace=LIFE_EDU_STATE.pdfWorkspace,status=document.getElementById('lePdfStatus');if(!file)return;
  if(!workspace||!page){lifeEduSetImportMessage_(status,'找不到要替換的初稿頁面。',true);input.value='';return;}
  if(lifeEduAnyScanImportLocked_()||page.importing){lifeEduSetImportMessage_(status,'目前有掃描匯入進行中；完成後才可替換頁面。',true);input.value='';return;}
  if(file.size>100*1024*1024){lifeEduSetImportMessage_(status,'替換檔超過 100 MB。',true);input.value='';return;}
  var type=lifeEduInputFileType_(file);if(['application/pdf','image/jpeg','image/png'].indexOf(type)<0){lifeEduSetImportMessage_(status,'只接受單頁 PDF、JPG 或 PNG。',true);input.value='';return;}
  var imported=Boolean(page.importedAt||page.replacingImport),importTarget=imported?lifeEduFindImportedPageTarget_(page):null;
  if(imported&&!importTarget){lifeEduSetImportMessage_(status,'找不到唯一的已匯入學生附件關聯；為免覆寫錯誤，請到第五步以「更新內容」處理該生掃描。',true);input.value='';return;}
  if(imported&&!window.confirm('替換第 '+pageNumber+' 頁會在重做 OCR 並匯入後更新同一位學生的原頁附件；老師修訂稿和核對後 OCR 會保留。繼續？')){input.value='';return;}
  var expectedSnapshot=localStorage.getItem(LIFE_EDU_LOCAL_KEY),previous=lifeEduClone_(workspace);
  var work=function(){
    if(!lifeEduCommitDirtyBeforeAttachment_(status))return;
    if(LIFE_EDU_STATE.pdfWorkspace!==workspace)throw new Error('逐頁工作區已更新；請重新載入頁面後再替換。');
    lifeEduSetImportMessage_(status,'正在處理第 '+pageNumber+' 頁替換檔…',false);
    return lifeEduBuildCombinedPdf_([file],status).then(function(replacement){if(replacement.pageCount!==1)throw new Error('替換檔有 '+replacement.pageCount+' 頁；請選擇單頁 PDF 或一張圖片。');return lifeEduGetPdfSourceBlob_().then(function(sourceBlob){return lifeEduReplacePdfPageBlob_(sourceBlob,replacement.bytes,pageNumber,workspace.pageCount).then(function(bytes){return {bytes:bytes,replacement:replacement};});});}).then(function(result){
      var id=lifeEduNewFileId_(),record={id:id,fileName:workspace.fileName,mimeType:'application/pdf',createdAt:new Date().toISOString(),blob:new Blob([result.bytes],{type:'application/pdf'})};return lifeEduAttachmentPut_(record).then(function(){
        var next=lifeEduClone_(workspace),targetPage=next.pages.filter(function(item){return Number(item.pageNumber)===pageNumber;})[0];targetPage.sourceFileName=file.name;targetPage.className='';targetPage.classNumber='';targetPage.studentName='';targetPage.primarySchool='';targetPage.teacherName='';targetPage.ocrText='';targetPage.uncertainNotes='';
        if(imported){targetPage.importedAt=page.importedAt;targetPage.importedAttachmentId=importTarget.attachmentId;targetPage.replacesImportedAttachmentId=importTarget.attachmentId;targetPage.replacingImport=true;}else{targetPage.importedAt='';targetPage.importedAttachmentId='';targetPage.replacesImportedAttachmentId='';targetPage.replacingImport=false;}
        next.sourceFileId=id;next.updatedAt=new Date().toISOString();LIFE_EDU_STATE.pdfWorkspace=next;lifeEduInvalidatePdfRenderCache_();
        if(!lifeEduPersistLocalNow_()){LIFE_EDU_STATE.pdfWorkspace=workspace;lifeEduInvalidatePdfRenderCache_();return lifeEduAttachmentDelete_(id).then(function(){throw new Error('本機記錄未能保存；原稿頁面和配對已保留。');});}
        LIFE_EDU_STATE.savedRows=lifeEduClone_(LIFE_EDU_STATE.rows);lifeEduRender_();var panel=document.getElementById('leImportPanel');if(panel)panel.open=true;lifeEduSetImportMessage_(document.getElementById('lePdfStatus'),'第 '+pageNumber+' 頁初稿已替換。'+(imported?'重做 OCR 後可更新同一學生的附件。':'第三步學生配對已保留。'),false);
      });
    });
  };
  lifeEduWithCrossTabWriteLock_(work,status,'另一個分頁正在處理本機資料；完成後再替換頁面。',expectedSnapshot).catch(function(error){lifeEduSetImportMessage_(status,error.message||'單頁替換失敗。',true);}).finally(function(){input.value='';});
}
function lifeEduMakePdfPage_(sourceDoc,pageNumber){return PDFLib.PDFDocument.create().then(function(out){return out.copyPages(sourceDoc,[pageNumber-1]).then(function(pages){out.addPage(pages[0]);return out.save();});});}
function lifeEduRevokePageImageUrls_(){var maps=[LIFE_EDU_STATE.pdfPageImageUrls||{},LIFE_EDU_STATE.pdfPageThumbUrls||{}];maps.forEach(function(urls){Object.keys(urls).forEach(function(key){URL.revokeObjectURL(urls[key]);});});LIFE_EDU_STATE.pdfPageImageUrls=Object.create(null);LIFE_EDU_STATE.pdfPageThumbUrls=Object.create(null);}
function lifeEduInvalidatePdfRenderCache_(){lifeEduRevokePageImageUrls_();if(LIFE_EDU_STATE.pdfThumbObserver){LIFE_EDU_STATE.pdfThumbObserver.disconnect();LIFE_EDU_STATE.pdfThumbObserver=null;}LIFE_EDU_STATE.pdfPageImageCache=Object.create(null);LIFE_EDU_STATE.pdfPageThumbCache=Object.create(null);var doc=LIFE_EDU_STATE.pdfJsDocument;if(doc&&typeof doc.destroy==='function')try{doc.destroy();}catch(error){}LIFE_EDU_STATE.pdfJsDocument=null;LIFE_EDU_STATE.pdfJsDocumentPromise=null;LIFE_EDU_STATE.pdfJsSourceFileId='';}
function lifeEduRevokeSourcePreviewUrls_(){(LIFE_EDU_STATE.sourcePreviewUrls||[]).forEach(function(url){URL.revokeObjectURL(url);});LIFE_EDU_STATE.sourcePreviewUrls=[];}
function lifeEduRenderDocumentPageToImage_(pdf,pageNumber,maxWidth,mimeType,quality){var canvas=document.createElement('canvas');return pdf.getPage(pageNumber).then(function(page){var initial=page.getViewport({scale:1}),limit=Number(maxWidth)||1500,scale=Math.min(limit<=400?1:2,limit/initial.width),viewport=page.getViewport({scale:scale}),context=canvas.getContext('2d');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);return page.render({canvasContext:context,viewport:viewport}).promise.then(function(){return new Promise(function(resolve,reject){canvas.toBlob(function(blob){if(blob)resolve(blob);else reject(new Error('無法產生原稿圖片。'));},mimeType||'image/png',quality);});});}).finally(function(){canvas.width=0;canvas.height=0;});}
function lifeEduGetPdfJsDocument_(){
  var workspace=LIFE_EDU_STATE.pdfWorkspace;if(!workspace||!workspace.sourceFileId)return Promise.reject(new Error('請先在第三步載入 PDF 初稿。'));if(typeof pdfjsLib==='undefined')return Promise.reject(new Error('PDF 原稿圖片元件尚未載入。'));
  if(LIFE_EDU_STATE.pdfJsSourceFileId!==workspace.sourceFileId){lifeEduInvalidatePdfRenderCache_();LIFE_EDU_STATE.pdfJsSourceFileId=workspace.sourceFileId;}
  if(LIFE_EDU_STATE.pdfJsDocument)return Promise.resolve(LIFE_EDU_STATE.pdfJsDocument);if(LIFE_EDU_STATE.pdfJsDocumentPromise)return LIFE_EDU_STATE.pdfJsDocumentPromise;
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';var sourceFileId=workspace.sourceFileId;
  LIFE_EDU_STATE.pdfJsDocumentPromise=lifeEduGetPdfSourceBlob_().then(function(blob){return blob.arrayBuffer();}).then(function(buffer){return pdfjsLib.getDocument({data:new Uint8Array(buffer)}).promise;}).then(function(doc){if(!LIFE_EDU_STATE.pdfWorkspace||LIFE_EDU_STATE.pdfWorkspace.sourceFileId!==sourceFileId){doc.destroy();throw new Error('逐頁工作區已替換；請重新載入頁面圖片。');}LIFE_EDU_STATE.pdfJsDocument=doc;return doc;}).finally(function(){LIFE_EDU_STATE.pdfJsDocumentPromise=null;});return LIFE_EDU_STATE.pdfJsDocumentPromise;
}
function lifeEduRenderPdfPageToPng_(blob,pageNumber,maxWidth,mimeType,quality){
  if(typeof pdfjsLib==='undefined')return Promise.reject(new Error('PDF 原稿圖片元件尚未載入。'));pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  return blob.arrayBuffer().then(function(buffer){var doc=null;return pdfjsLib.getDocument({data:new Uint8Array(buffer)}).promise.then(function(pdf){doc=pdf;return lifeEduRenderDocumentPageToImage_(pdf,pageNumber,maxWidth,mimeType,quality);}).finally(function(){if(doc)doc.destroy();});});
}
function lifeEduRenderWorkspacePage_(pageNumber,maxWidth,mimeType,quality){return lifeEduGetPdfJsDocument_().then(function(pdf){return lifeEduRenderDocumentPageToImage_(pdf,pageNumber,maxWidth,mimeType,quality);});}
function lifeEduRememberFullPageImage_(pageNumber,blob){Object.keys(LIFE_EDU_STATE.pdfPageImageUrls||{}).forEach(function(key){if(Number(key)!==Number(pageNumber)){URL.revokeObjectURL(LIFE_EDU_STATE.pdfPageImageUrls[key]);delete LIFE_EDU_STATE.pdfPageImageUrls[key];}});LIFE_EDU_STATE.pdfPageImageCache=Object.create(null);LIFE_EDU_STATE.pdfPageImageCache[pageNumber]=blob;}
function lifeEduPageImageUrl_(pageNumber,blob){var prior=LIFE_EDU_STATE.pdfPageImageUrls[pageNumber];if(prior)URL.revokeObjectURL(prior);var url=URL.createObjectURL(blob);LIFE_EDU_STATE.pdfPageImageUrls[pageNumber]=url;return url;}
function lifeEduLoadPagePreview_(pageNumber,button){
  var workspace=LIFE_EDU_STATE.pdfWorkspace,page=lifeEduGetPdfPage_(pageNumber),image=document.querySelector('[data-le-page-image="'+pageNumber+'"]'),copy=document.querySelector('[data-le-copy-page-image="'+pageNumber+'"]');if(!workspace||!page||!image)return Promise.resolve();
  if(LIFE_EDU_STATE.pdfPageImageCache[pageNumber]){var cached=LIFE_EDU_STATE.pdfPageImageCache[pageNumber],cachedUrl=lifeEduPageImageUrl_(pageNumber,cached);image.src=cachedUrl;image.hidden=false;if(copy)copy.disabled=false;return Promise.resolve(cached);}
  if(button){button.disabled=true;button.textContent='產生中…';}lifeEduSetImportMessage_(document.getElementById('lePdfStatus'),'正在產生第 '+pageNumber+' 頁原稿圖片…',false);
  return lifeEduRenderWorkspacePage_(pageNumber,1500,'image/png').then(function(imageBlob){if(!image.isConnected||LIFE_EDU_STATE.pdfWorkspace!==workspace)return null;lifeEduRememberFullPageImage_(pageNumber,imageBlob);var url=lifeEduPageImageUrl_(pageNumber,imageBlob);image.src=url;image.hidden=false;if(copy)copy.disabled=false;lifeEduSetImportMessage_(document.getElementById('lePdfStatus'),'第 '+pageNumber+' 頁圖片已在本機準備好，可複製到 Gemini。',false);return imageBlob;}).catch(function(error){lifeEduSetImportMessage_(document.getElementById('lePdfStatus'),error.message||'原稿圖片產生失敗。',true);throw error;}).finally(function(){if(button&&button.isConnected){button.disabled=false;button.textContent='重新產生原稿圖片';}});
}
function lifeEduWritePageImageToClipboard_(pageNumber,imageBlob){if(!navigator.clipboard||typeof navigator.clipboard.write!=='function'||typeof ClipboardItem==='undefined'){lifeEduDownload_(imageBlob,'謝師恩原稿第'+pageNumber+'頁.png');lifeEduToast_('此瀏覽器未支援複製圖片，已下載 PNG；可在 Gemini 附加該圖片。');return;}navigator.clipboard.write([new ClipboardItem({'image/png':imageBlob})]).then(function(){lifeEduToast_('原稿第 '+pageNumber+' 頁圖片已複製，可到 Gemini 貼上。');}).catch(function(){lifeEduDownload_(imageBlob,'謝師恩原稿第'+pageNumber+'頁.png');lifeEduToast_('瀏覽器未允許寫入剪貼簿，已下載 PNG；可在 Gemini 附加該圖片。');});}
function lifeEduCopyPageImage_(pageNumber){var imageBlob=(LIFE_EDU_STATE.pdfPageImageCache||{})[pageNumber];if(imageBlob){lifeEduWritePageImageToClipboard_(pageNumber,imageBlob);return;}var status=document.getElementById('lePdfStatus'),button=document.querySelector('[data-le-copy-page-image="'+pageNumber+'"]');if(button){button.disabled=true;button.textContent='準備圖片…';}lifeEduRenderWorkspacePage_(pageNumber,1500,'image/png').then(function(blob){if(LIFE_EDU_STATE.pdfWorkspace&&lifeEduGetPdfPage_(pageNumber)){lifeEduRememberFullPageImage_(pageNumber,blob);var image=document.querySelector('[data-le-page-image="'+pageNumber+'"]');if(image){image.src=lifeEduPageImageUrl_(pageNumber,blob);image.hidden=false;}lifeEduWritePageImageToClipboard_(pageNumber,blob);}}).catch(function(error){lifeEduSetImportMessage_(status,error.message||'原稿圖片產生失敗。',true);}).finally(function(){if(button&&button.isConnected){button.disabled=false;button.textContent='複製圖片交 Gemini';}});}
function lifeEduLoadPageThumbnail_(pageNumber,button){var image=document.querySelector('[data-le-page-thumb="'+pageNumber+'"]'),status=document.querySelector('[data-le-page-thumb-status="'+pageNumber+'"]');button=button||document.querySelector('[data-le-load-thumbnail="'+pageNumber+'"]');if(!image)return Promise.resolve();if(LIFE_EDU_STATE.pdfPageThumbCache[pageNumber]){var cached=LIFE_EDU_STATE.pdfPageThumbCache[pageNumber],url=URL.createObjectURL(cached);LIFE_EDU_STATE.pdfPageThumbUrls[pageNumber]=url;image.src=url;if(button)button.hidden=true;if(status)status.textContent='';return Promise.resolve(cached);}if(button){button.disabled=true;button.textContent='載入中…';}if(status)status.textContent='正在產生縮圖…';return lifeEduRenderWorkspacePage_(pageNumber,360,'image/jpeg',0.72).then(function(blob){if(!image.isConnected)return blob;LIFE_EDU_STATE.pdfPageThumbCache[pageNumber]=blob;var url=URL.createObjectURL(blob);LIFE_EDU_STATE.pdfPageThumbUrls[pageNumber]=url;image.src=url;if(button)button.hidden=true;if(status)status.textContent='';return blob;}).catch(function(error){if(status)status.textContent=error.message||'縮圖載入失敗';if(button){button.disabled=false;button.textContent='重試載入縮圖';}return null;});}
function lifeEduRestoreCachedPagePreviews_(){Object.keys(LIFE_EDU_STATE.pdfPageImageCache||{}).forEach(function(key){var image=document.querySelector('[data-le-page-image="'+key+'"]'),copy=document.querySelector('[data-le-copy-page-image="'+key+'"]'),blob=LIFE_EDU_STATE.pdfPageImageCache[key];if(!image||!blob)return;var url=URL.createObjectURL(blob);LIFE_EDU_STATE.pdfPageImageUrls[key]=url;image.src=url;image.hidden=false;if(copy)copy.disabled=false;});}
function lifeEduObservePageThumbnails_(){if(LIFE_EDU_STATE.pdfThumbObserver){LIFE_EDU_STATE.pdfThumbObserver.disconnect();LIFE_EDU_STATE.pdfThumbObserver=null;}var images=Array.prototype.slice.call(document.querySelectorAll('[data-le-page-thumb]'));if(!images.length)return;if(typeof IntersectionObserver==='undefined'){images.slice(0,12).forEach(function(image){lifeEduLoadPageThumbnail_(Number(image.dataset.lePageThumb));});return;}var observer=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){observer.unobserve(entry.target);lifeEduLoadPageThumbnail_(Number(entry.target.dataset.lePageThumb));}});},{rootMargin:'280px 0px'});LIFE_EDU_STATE.pdfThumbObserver=observer;images.forEach(function(image){observer.observe(image);});}
function lifeEduUpdatePageMatchUI_(pageNumber){var page=lifeEduGetPdfPage_(pageNumber),select=document.querySelector('[data-le-page-match="'+pageNumber+'"]'),candidate=document.querySelector('[data-le-page-match-status="'+pageNumber+'"]'),assignedNode=document.querySelector('[data-le-page-match-assigned="'+pageNumber+'"]'),assigned=page&&LIFE_EDU_STATE.rows.filter(function(row){return row.id===page.assignedStudentId;})[0];if(!page)return;if(candidate)candidate.textContent=[page.className,page.classNumber&&'第'+page.classNumber+'號',page.studentName].filter(Boolean).join(' · ')||'待 OCR 後核對';if(assignedNode)assignedNode.textContent=assigned?'已配對 '+assigned.className+' 第'+assigned.classNumber+'號':'尚未配對';var button=document.querySelector('[data-le-import-page="'+pageNumber+'"]');if(button)button.disabled=!(page.assignedStudentId&&page.ocrText&&(!page.importedAt||page.replacingImport)&&!page.importing);var workspace=LIFE_EDU_STATE.pdfWorkspace,summary=document.getElementById('lePageMatchSummary');if(summary&&workspace)summary.textContent=workspace.pages.filter(function(item){return LIFE_EDU_STATE.rows.some(function(row){return row.id===item.assignedStudentId;});}).length+' / '+workspace.pageCount+' 頁已配對';var label=document.querySelector('[data-le-page-assigned="'+pageNumber+'"]');if(label)label.textContent='第三步配對：'+(assigned?assigned.className+' 第'+assigned.classNumber+'號 · '+(assigned.nameZh||assigned.nameEn||'待辨讀'):'第三步尚未配對');}
function lifeEduUpdatePageView_(){var workspace=LIFE_EDU_STATE.pdfWorkspace,list=document.querySelector('.le-page-list'),position=document.getElementById('lePageViewPosition'),current=Number(LIFE_EDU_STATE.pdfPageViewPage)||1;if(workspace)current=Math.max(1,Math.min(workspace.pageCount,current));LIFE_EDU_STATE.pdfPageViewPage=current;if(list){list.classList.toggle('le-page-list-single',LIFE_EDU_STATE.pdfPageView==='single');list.classList.toggle('le-page-list-grid',LIFE_EDU_STATE.pdfPageView!=='single');list.querySelectorAll('[data-le-page-card]').forEach(function(card){card.hidden=LIFE_EDU_STATE.pdfPageView==='single'&&Number(card.dataset.lePageCard)!==current;});}document.querySelectorAll('[data-le-page-view]').forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.lePageView===LIFE_EDU_STATE.pdfPageView));});if(position)position.textContent=workspace?'第 '+current+' / '+workspace.pageCount+' 頁':'尚未載入';var previous=document.querySelector('[data-le-page-nav="previous"]'),next=document.querySelector('[data-le-page-nav="next"]');if(previous)previous.disabled=!workspace||current<=1;if(next)next.disabled=!workspace||current>=workspace.pageCount;if(workspace&&LIFE_EDU_STATE.pdfPageView==='single'){var image=document.querySelector('[data-le-page-image="'+current+'"]');if(image&&!image.hasAttribute('src'))lifeEduLoadPagePreview_(current);}}
function lifeEduCopyText_(text,label){
  var value=String(text||'');if(navigator.clipboard&&typeof navigator.clipboard.writeText==='function')return navigator.clipboard.writeText(value).then(function(){lifeEduToast_(label+'已複製。');}).catch(function(){return lifeEduCopyTextFallback_(value,label);});
  return lifeEduCopyTextFallback_(value,label);
}
function lifeEduCopyTextFallback_(value,label){var input=document.createElement('textarea');input.value=value;input.setAttribute('readonly','');input.style.position='fixed';input.style.opacity='0';document.body.appendChild(input);input.select();var ok=false;try{ok=document.execCommand('copy');}catch(error){}input.remove();if(ok)lifeEduToast_(label+'已複製。');else lifeEduToast_('無法自動複製；請允許剪貼簿存取後重試。',true);return Promise.resolve(ok);}
function lifeEduCopyGeminiOcrPrompt_(pageNumber){
  var page=lifeEduGetPdfPage_(pageNumber),assigned=page&&LIFE_EDU_STATE.rows.filter(function(row){return row.id===page.assignedStudentId;})[0],pairing=assigned?assigned.className+' 第'+assigned.classNumber+'號 · '+(assigned.nameZh||assigned.nameEn||''):'尚未在第三步配對';
  var prompt='請逐字辨認我附上的謝師恩文章掃描圖，只處理第 '+pageNumber+' 頁。第三步現有配對是「'+pairing+'」，這只供你知道老師之後要核對哪位學生，絕不可把這項配對當成圖片文字或用它推斷班別、班號、姓名、小學、老師或文章內容。請使用繁體中文，保留原稿字詞、標點和分段；不要修正錯字、潤飾、推測或補寫。辨不清的字用「〔疑字：候選一／候選二〕」標示，並在 uncertainNotes 說明位置。只擷取圖片中實際可見的班別、班號、學生姓名、小學和收件老師；看不清的欄位留空。不要輸出電話、地址或其他聯絡資料。只輸出一個純 JSON 物件，不要 Markdown，格式如下：\n{"page":'+pageNumber+',"className":"","classNumber":"","studentName":"","primarySchool":"","teacherName":"","ocrText":"","uncertainNotes":[]}';
  lifeEduCopyText_(prompt,'Gemini OCR 提示');
}
function lifeEduDefaultTeacherRevisionPrompt_(){return '請以香港中學生活教育老師的角度，協助修訂以下學生的謝師文章。使用繁體中文，修正錯別字、標點、格式及不通順句子，令文句自然流暢。保留學生原意、真實經歷和年齡合適的表達，不要過度成人化或捏造原稿沒有的事實。語氣溫和、真誠、尊重；如原文提到困難或不快，體諒地保留原意，不責怪、不誇大，也不要改寫成虛構的正面故事。如原稿未有結尾，可按原意補上一句合適的感謝或祝福。遇到不確定的字句，原樣保留並標示〔待老師／學生確認〕。只輸出修訂後文章，不加標題、解說或 Markdown。';}
function lifeEduTeacherRevisionSource_(){var row=lifeEduSelected_(),verified=document.getElementById('leVerifiedOcr'),value=verified&&String(verified.value||'').trim();return value||row&&String(row.verifiedOcrText||row.sourceOcrText||'').trim()||'';}
function lifeEduBuildTeacherRevisionPrompt_(){var source=lifeEduTeacherRevisionSource_(),instruction=document.getElementById('leTeacherRevisionPrompt'),text=String(instruction?instruction.value:(LIFE_EDU_STATE.teacherRevisionPrompt||lifeEduDefaultTeacherRevisionPrompt_())).trim();if(!source)throw new Error('目前學生沒有核對後 OCR 或原始 OCR 文字；請先完成第四步並匯入文章。');if(!text)throw new Error('請輸入老師修訂提示語。');return text+'\n\n【學生文章原稿（核對後 OCR 優先）】\n'+source;}
function lifeEduCopyGeminiEditPrompt_(){try{var prompt=lifeEduBuildTeacherRevisionPrompt_();lifeEduCopyText_(prompt,'Gemini 老師修訂提示');}catch(error){lifeEduToast_(error.message||'無法建立老師修訂提示。',true);}}
function lifeEduRunMiniMaxRevision_(){
  var key=document.getElementById('leTeacherRevisionKey'),button=document.querySelector('[data-le-minimax-revision]'),status=document.getElementById('leTeacherRevisionStatus'),studentId=LIFE_EDU_STATE.selectedId;
  if(LIFE_EDU_STATE.teacherRevisionBusy)return;if(!key||!key.value.trim()){if(status)status.textContent='請輸入 MiniMax API key；此欄不會保存。';return;}
  var fullPrompt;try{fullPrompt=lifeEduBuildTeacherRevisionPrompt_();}catch(error){if(status)status.textContent=error.message||'無法建立修訂要求。';return;}
  var requestCredential=key.value.trim(),requestBody={model:LIFE_EDU_MINIMAX_MODEL,messages:[{role:'user',content:fullPrompt}],reasoning_effort:'high',max_completion_tokens:3000};key.value='';LIFE_EDU_STATE.teacherRevisionBusy=true;if(button){button.disabled=true;button.textContent='MiniMax 修訂中…';}if(status)status.textContent='文章和自訂提示正直接傳送至 MiniMax；請稍候。';
  function finish_(message,error){LIFE_EDU_STATE.teacherRevisionBusy=false;if(button&&button.isConnected){button.disabled=false;button.textContent='用 MiniMax 產生修訂稿';}if(status&&status.isConnected)status.textContent=message;if(error)lifeEduToast_(message,true);}
  var request;try{request=fetch(LIFE_EDU_MINIMAX_ENDPOINT,{method:'POST',mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',headers:{'Authorization':'Bearer '+requestCredential,'Content-Type':'application/json'},body:JSON.stringify(requestBody)});}catch(error){request=Promise.reject(error);}
  Promise.resolve(request).then(function(response){return response.text().then(function(raw){var result;try{result=JSON.parse(raw);}catch(error){throw new Error('MiniMax 回應格式無法解析（HTTP '+response.status+'）。');}if(!response.ok){var detail=result.base_resp&&result.base_resp.status_msg||result.error&&result.error.message;throw new Error('MiniMax 回應 HTTP '+response.status+(detail?'：'+detail:'；請檢查 API key、配額及網絡連線。'));}var choice=result.choices&&result.choices[0],content=choice&&choice.message&&choice.message.content,finishReason=String(choice&&choice.finish_reason||'').toLowerCase();if(finishReason==='length'||finishReason==='max_tokens'||finishReason==='max_completion_tokens')throw new Error('MiniMax 回應達到輸出上限，文章可能未完成；沒有放入建議稿，請縮短原稿或提示後重試。');if(Array.isArray(content))content=content.map(function(item){return item&&item.text||'';}).join('\n');if(!content)throw new Error('MiniMax 沒有回傳修訂文章。');return String(content).trim();});}).then(function(text){if(LIFE_EDU_STATE.selectedId!==studentId){finish_('MiniMax 修訂已完成，但學生選擇已改變；結果沒有放入其他學生。',true);return;}if(text.length>2800)throw new Error('MiniMax 修訂稿超過 2,800 字，已停止套用；請分段處理。');var candidate=document.getElementById('leRevisionCandidate');if(!candidate){finish_('MiniMax 已完成，但畫面已更新；結果沒有放入學生記錄，請重試。',true);return;}candidate.value=text;finish_('MiniMax 已產生建議稿。請先核對，再按「採用至老師修訂稿」。',false);}).catch(function(error){finish_(error.message||'MiniMax 修訂失敗；API key 已清除。',true);}).finally(function(){LIFE_EDU_STATE.teacherRevisionBusy=false;requestCredential='';requestBody=null;});
}
function lifeEduAdoptRevision_(){var candidate=document.getElementById('leRevisionCandidate'),corrected=document.getElementById('leCorrectedText'),status=document.getElementById('leTeacherRevisionStatus'),text=String(candidate&&candidate.value||'').trim();if(!text){if(status)status.textContent='請先貼上 Gemini 結果，或用 MiniMax 產生建議稿。';return;}if(text.length>2800){if(status)status.textContent='建議稿超過 2,800 字，請先整理或分段。';return;}if(!corrected){return;}if(corrected.value.trim()&&corrected.value.trim()!==text&&!window.confirm('以這份建議稿取代目前老師修訂稿？原始 OCR 和核對後 OCR 會保留。'))return;corrected.value=text;lifeEduMarkDirty_();if(status)status.textContent='已放入老師修訂稿。請檢查標色修改及逐字內容，再保存學生記錄。'}
function lifeEduRevisionDiff_(before,after){
  var a=Array.from(String(before||'')),b=Array.from(String(after||'')),prefix=0,suffix=0,parts=[];
  while(prefix<a.length&&prefix<b.length&&a[prefix]===b[prefix])prefix++;
  while(suffix<a.length-prefix&&suffix<b.length-prefix&&a[a.length-1-suffix]===b[b.length-1-suffix])suffix++;
  if(prefix)parts.push({type:'equal',text:a.slice(0,prefix).join('')});var oldMid=a.slice(prefix,a.length-suffix),newMid=b.slice(prefix,b.length-suffix);
  if(oldMid.length&&newMid.length&&(oldMid.length+1)*(newMid.length+1)>2000000){parts.push({type:'change',before:oldMid.join(''),after:newMid.join('')});}
  else if(oldMid.length||newMid.length){var cols=newMid.length+1,dp=new Uint16Array((oldMid.length+1)*cols);for(var i=oldMid.length-1;i>=0;i--)for(var j=newMid.length-1;j>=0;j--){var cell=i*cols+j;dp[cell]=oldMid[i]===newMid[j]?dp[cell+cols+1]+1:Math.max(dp[cell+cols],dp[cell+1]);}
    var oldPart=[],newPart=[];function flushChange_(){if(oldPart.length||newPart.length){parts.push({type:'change',before:oldPart.join(''),after:newPart.join('')});oldPart=[];newPart=[];}}
    i=0;j=0;while(i<oldMid.length&&j<newMid.length){if(oldMid[i]===newMid[j]){flushChange_();var equal=oldMid[i];var last=parts[parts.length-1];if(last&&last.type==='equal')last.text+=equal;else parts.push({type:'equal',text:equal});i++;j++;}else if(dp[(i+1)*cols+j]>=dp[i*cols+j+1])oldPart.push(oldMid[i++]);else newPart.push(newMid[j++]);}while(i<oldMid.length)oldPart.push(oldMid[i++]);while(j<newMid.length)newPart.push(newMid[j++]);flushChange_();
  }
  if(suffix){var tail=a.slice(a.length-suffix).join(''),lastPart=parts[parts.length-1];if(lastPart&&lastPart.type==='equal')lastPart.text+=tail;else parts.push({type:'equal',text:tail});}return parts;
}
function lifeEduRenderRevisionDiff_(){var target=document.getElementById('leRevisionDiffPreview'),row=lifeEduSelected_();if(!target||!row)return;var verified=document.getElementById('leVerifiedOcr'),corrected=document.getElementById('leCorrectedText'),before=String(verified&&verified.value||row.verifiedOcrText||row.sourceOcrText||''),after=String(corrected&&corrected.value||row.correctedText||'');LIFE_EDU_STATE.revisionChanges=[];if(!after.trim()){target.textContent=before.trim()?'完成修訂後，這裡會標示與核對後 OCR 不同的部分。':'先在第四步匯入文章文字。';return;}if(!before.trim()){target.textContent='沒有核對後 OCR 可比較；請先完成第四步。';return;}if(before===after){target.textContent='目前修訂稿與核對後 OCR 相同，沒有差異。';return;}var changes=[],html='';lifeEduRevisionDiff_(before,after).forEach(function(part){if(part.type==='equal'){html+=lifeEduEsc_(part.text);return;}var number=changes.length;changes.push({before:part.before,after:part.after});var visible=part.after||'〔刪除文字〕';html+='<button type="button" class="le-revision-diff-change" data-le-revision-change="'+number+'" aria-label="查看第 '+(number+1)+' 處修改內容">'+lifeEduEsc_(visible)+'</button>';});LIFE_EDU_STATE.revisionChanges=changes;target.innerHTML=html;}
function lifeEduShowRevisionChange_(index){var item=LIFE_EDU_STATE.revisionChanges[index],dialog=document.getElementById('leRevisionDiffDialog');if(!item||!dialog)return;var before=dialog.querySelector('[data-le-revision-before]'),after=dialog.querySelector('[data-le-revision-after]');if(before)before.textContent=item.before||'（原稿沒有文字：新增內容）';if(after)after.textContent=item.after||'（此處文字已刪除）';if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');}
function lifeEduRefreshSourcePreviews_(){
  document.querySelectorAll('[data-le-source-preview]').forEach(function(image){var id=image.dataset.leSourcePreview;lifeEduAttachmentGet_(id).then(function(record){if(!record||!record.blob||!image.isConnected)return;var mime=String(record.mimeType||record.blob.type||'').toLowerCase(),preview=mime==='application/pdf'?lifeEduRenderPdfPageToPng_(record.blob,1):Promise.resolve(record.blob);return preview.then(function(blob){if(!image.isConnected)return;var url=URL.createObjectURL(blob);LIFE_EDU_STATE.sourcePreviewUrls.push(url);image.src=url;image.hidden=false;}).catch(function(){});}).catch(function(){});});
}
function lifeEduDownloadPdfPage_(pageNumber){var workspace=LIFE_EDU_STATE.pdfWorkspace;if(!workspace||!Number.isInteger(pageNumber)||pageNumber<1||pageNumber>workspace.pageCount)return;lifeEduGetPdfSourceBlob_().then(function(blob){return blob.arrayBuffer();}).then(function(buffer){return PDFLib.PDFDocument.load(new Uint8Array(buffer)).then(function(doc){return lifeEduMakePdfPage_(doc,pageNumber);});}).then(function(bytes){lifeEduDownload_(new Blob([bytes],{type:'application/pdf'}),lifeEduSafeFileStem_(workspace.fileName)+'-page-'+String(pageNumber).padStart(3,'0')+'.pdf');}).catch(function(error){lifeEduToast_(error.message||'單頁 PDF 產生失敗。',true);});}
function lifeEduSplitAllPdf_(){
  var workspace=LIFE_EDU_STATE.pdfWorkspace,button=document.querySelector('[data-le-split-all]'),status=document.getElementById('lePdfStatus');if(!workspace||!workspace.pageCount)return;if(typeof PizZip==='undefined'||typeof PDFLib==='undefined'){lifeEduSetImportMessage_(status,'PDF／ZIP 元件未載入。',true);return;}if(button){button.disabled=true;button.textContent='逐頁拆分中…';}lifeEduSetImportMessage_(status,'正在逐頁拆分，請稍候…',false);
  lifeEduGetPdfSourceBlob_().then(function(blob){return blob.arrayBuffer();}).then(function(buffer){return PDFLib.PDFDocument.load(new Uint8Array(buffer)).then(function(source){var zip=new PizZip(),stem=lifeEduSafeFileStem_(workspace.fileName);return Array.from({length:workspace.pageCount},function(_,i){return i+1;}).reduce(function(chain,page){return chain.then(function(){return lifeEduMakePdfPage_(source,page).then(function(bytes){zip.file(stem+'-page-'+String(page).padStart(3,'0')+'.pdf',bytes);if(status)status.textContent='已拆分 '+page+' / '+workspace.pageCount+' 頁…';});});},Promise.resolve()).then(function(){return zip.generate({type:'blob',compression:'DEFLATE',compressionOptions:{level:4}});});});}).then(function(blob){lifeEduDownload_(blob,lifeEduSafeFileStem_(workspace.fileName)+'-逐頁PDF.zip');lifeEduSetImportMessage_(status,'已下載 '+workspace.pageCount+' 份單頁 PDF。',false);}).catch(function(error){lifeEduSetImportMessage_(status,error.message||'拆分 PDF 失敗。',true);}).finally(function(){if(button){button.disabled=false;button.textContent='下載全部單頁 PDF ZIP';}});
}
function lifeEduExportPageJson_(){var workspace=LIFE_EDU_STATE.pdfWorkspace;if(!workspace)return;var data={sourceFileName:workspace.fileName,pageCount:workspace.pageCount,pages:workspace.pages.map(function(page){return {page:page.pageNumber,sourceFileName:page.sourceFileName||workspace.fileName,className:page.className,classNumber:page.classNumber,studentName:page.studentName,primarySchool:page.primarySchool,teacherName:page.teacherName,ocrText:page.ocrText,uncertainNotes:page.uncertainNotes,assignedStudentId:page.assignedStudentId,importedAt:page.importedAt,importedAttachmentId:page.importedAttachmentId,replacesImportedAttachmentId:page.replacesImportedAttachmentId,replacingImport:page.replacingImport};})};lifeEduDownload_(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}),lifeEduSafeFileStem_(workspace.fileName)+'-逐頁配對.json');}
function lifeEduApplyPageOcrPaste_(){
  var workspace=LIFE_EDU_STATE.pdfWorkspace,paste=document.getElementById('lePageOcrPaste'),status=document.getElementById('leOcrStatus');
  if(lifeEduAnyScanImportLocked_()){lifeEduSetImportMessage_(status,'掃描匯入仍在進行；完成後再套用逐頁 OCR。',true);return;}
  if(!workspace){lifeEduSetImportMessage_(status,'請先在第三步載入初稿並完成配對。',true);return;}
  var previousWorkspace=lifeEduClone_(workspace),pasted=paste&&paste.value||'';
  function rollbackWorkspace_(message){var panel=document.getElementById('leImportPanel'),wasOpen=Boolean(panel&&panel.open);if(LIFE_EDU_STATE.pdfWorkspace===workspace){LIFE_EDU_STATE.pdfWorkspace=previousWorkspace;lifeEduRender_();paste=document.getElementById('lePageOcrPaste');if(paste)paste.value=pasted;panel=document.getElementById('leImportPanel');if(panel&&wasOpen)panel.open=true;status=document.getElementById('leOcrStatus');}lifeEduSetImportMessage_(status,message,true);}
  try{
    var parsed=lifeEduParseOcrPaste_(pasted),pages=Array.isArray(parsed)?parsed:Array.isArray(parsed.pages)?parsed.pages:[parsed];
    if(!pages.length)throw new Error('OCR JSON 沒有逐頁內容。');
    var oversized=pages.filter(function(item){return item&&String(item.ocrText==null?(item.text||''):item.ocrText).length>2800;}).map(function(item){return Number(item.pageNumber==null?item.page:item.pageNumber)||'?';});
    if(oversized.length)throw new Error('第 '+oversized.join('、')+' 頁 OCR 超過 2,800 字；沒有套用任何頁面，請分段後再匯入。');
    var updated=0,unresolved=0,missingIdentity=0,identityMatch=0,identityMismatch=0,unpaired=0,skippedImported=0;
    pages.forEach(function(item){
      var number=Number(item.pageNumber==null?item.page:item.pageNumber),target=lifeEduGetPdfPage_(number);if(!target){unresolved++;return;}
      if((target.importedAt&&!target.replacingImport)||target.importing){skippedImported++;return;}
      var incomingClass=item.className==null?(item.class==null?item.classLabel:item.class):item.className;
      if(incomingClass!=null)target.className=String(incomingClass).trim();if(item.classNumber!=null)target.classNumber=String(item.classNumber).trim();
      ['studentName','primarySchool','teacherName'].forEach(function(key){if(Object.prototype.hasOwnProperty.call(item,key))target[key]=item[key]==null?'':String(item[key]).trim();});
      if(Object.prototype.hasOwnProperty.call(item,'uncertainNotes'))target.uncertainNotes=(Array.isArray(item.uncertainNotes)?item.uncertainNotes.join('；'):String(item.uncertainNotes||'')).slice(0,500);else if(item.ocrNote!=null)target.uncertainNotes=String(item.ocrNote).slice(0,500);
      if(Object.prototype.hasOwnProperty.call(item,'ocrText')||Object.prototype.hasOwnProperty.call(item,'text'))target.ocrText=lifeEduStripOcrContact_(item.ocrText||item.text||'').trim();
      var classKey=lifeEduNormalizeClassName_(target.className),numberRaw=String(target.classNumber||'').trim(),validNumber=lifeEduValidClassNumber_(numberRaw),assigned=LIFE_EDU_STATE.rows.filter(function(row){return row.id===target.assignedStudentId;})[0];
      if(!classKey||!validNumber)missingIdentity++;
      if(!assigned)unpaired++;
      if(assigned&&classKey&&validNumber){var same=classKey===lifeEduNormalizeClassName_(assigned.className)&&Number(numberRaw)===Number(assigned.classNumber),nameSame=!target.studentName||!assigned.nameZh||String(target.studentName).trim()===String(assigned.nameZh).trim();if(same&&nameSame)identityMatch++;else identityMismatch++;}
      updated++;
    });
    if(!updated){if(skippedImported){lifeEduSetImportMessage_(status,'所選頁面均已匯入；未修改逐頁 OCR。',false);return;}throw new Error('沒有 OCR 頁碼能對應目前 PDF 的頁數。');}
    workspace.updatedAt=new Date().toISOString();
    lifeEduPersistLocal_().then(function(saved){if(!saved){rollbackWorkspace_('逐頁 OCR 未能保存；已撤回本次套用，請處理本機記錄狀態後重試。');return;}lifeEduRender_();var panel=document.getElementById('leImportPanel');if(panel)panel.open=true;var details=[];if(unresolved)details.push('頁碼不符 '+unresolved+' 頁');if(missingIdentity)details.push(missingIdentity+' 頁身份候選不完整');if(identityMismatch)details.push(identityMismatch+' 頁候選與第三步配對有差異');if(unpaired)details.push(unpaired+' 頁仍未在第三步配對');if(skippedImported)details.push('已匯入頁略過 '+skippedImported+' 頁');lifeEduSetImportMessage_(document.getElementById('leOcrStatus'),'已套用 '+updated+' 頁 OCR；第三步配對沒有改動。候選一致 '+identityMatch+' 頁。'+(details.length?' '+details.join('；')+'。':' 請核對原稿後逐頁匯入。'),false);});
  }catch(error){rollbackWorkspace_(error.message||String(error));}
}
function lifeEduCommitDirtyBeforeAttachment_(statusNode){var countError=lifeEduCountValidationError_(lifeEduCurrentForm_());if(countError){var saveMsg=document.getElementById('leSaveMsg');if(saveMsg){saveMsg.textContent=countError+' 更正後才可繼續。';saveMsg.classList.add('error');}if(statusNode)lifeEduSetImportMessage_(statusNode,countError+' 更正後才可繼續處理掃描。',true);return false;}if(!LIFE_EDU_STATE.dirty)return true;if(!window.confirm('目前學生有未儲存更改。先保存這些欄位再處理掃描附件？'))return false;lifeEduApplyFormToRow_();if(!lifeEduPersistLocalNow_())return false;LIFE_EDU_STATE.savedRows=lifeEduClone_(LIFE_EDU_STATE.rows);LIFE_EDU_STATE.dirty=false;return true;}
function lifeEduAnyScanImportLocked_(){var locks=LIFE_EDU_STATE.scanImportLocks||{};return Object.keys(locks).length>0;}
function lifeEduAcquireScanImport_(studentId){if(!studentId)return false;var locks=LIFE_EDU_STATE.scanImportLocks||(LIFE_EDU_STATE.scanImportLocks=Object.create(null)),globalLock=studentId==='__backup_restore__'||studentId==='__attachment_cleanup__'||studentId==='__data_import__';if(globalLock){if(Object.keys(locks).length)return false;}else if(locks.__backup_restore__||locks.__attachment_cleanup__||locks.__data_import__||locks[studentId])return false;locks[studentId]=true;return true;}
function lifeEduReleaseScanImport_(studentId){var locks=LIFE_EDU_STATE.scanImportLocks;if(locks&&studentId)delete locks[studentId];}
function lifeEduWithCrossTabWriteLock_(operation,statusNode,busyMessage,expectedSnapshot){
  var manager=window.navigator&&window.navigator.locks;
  if(!manager||typeof manager.request!=='function'){if(statusNode)lifeEduSetImportMessage_(statusNode,'此瀏覽器未提供安全的跨分頁鎖定；沒有執行操作。',true);return Promise.resolve(false);}
  return manager.request('local-tools:thank-teacher-cards:write',{ifAvailable:true},function(lock){if(!lock)return false;var currentSnapshot=localStorage.getItem(LIFE_EDU_LOCAL_KEY);if(LIFE_EDU_STATE.externalStorageChanged||currentSnapshot!==LIFE_EDU_STATE.storageSnapshot)throw new Error('另一個分頁已更新本機記錄；請重新載入頁面，再重試這項操作。');if(expectedSnapshot!==undefined&&currentSnapshot!==expectedSnapshot)throw new Error('本機記錄已在另一分頁更新；請重新載入頁面，再重試這項操作。');LIFE_EDU_STATE.crossTabWriteDepth++;return Promise.resolve().then(operation).then(function(){return true;}).finally(function(){LIFE_EDU_STATE.crossTabWriteDepth=Math.max(0,LIFE_EDU_STATE.crossTabWriteDepth-1);});}).then(function(acquired){if(!acquired&&statusNode)lifeEduSetImportMessage_(statusNode,busyMessage||'另一個分頁正在處理本機資料；完成後再試。',true);return Boolean(acquired);},function(error){if(statusNode)lifeEduSetImportMessage_(statusNode,error.message||'跨分頁鎖定失敗，沒有執行操作。',true);return false;});
}
function lifeEduImportPdfPage_(pageNumber){
  var page=lifeEduGetPdfPage_(pageNumber),workspace=LIFE_EDU_STATE.pdfWorkspace;if(!page||!workspace||!page.assignedStudentId||!page.ocrText||page.importing||(page.importedAt&&!page.replacingImport))return;
  var expectedSnapshot=localStorage.getItem(LIFE_EDU_LOCAL_KEY),assignedStudentId=page.assignedStudentId,sourceFileId=workspace.sourceFileId,row=LIFE_EDU_STATE.rows.filter(function(item){return item.id===assignedStudentId;})[0],replaceExisting=Boolean(page.replacingImport),importTarget=replaceExisting?lifeEduFindImportedPageTarget_(page):null;
  if(!row){lifeEduToast_('第三步選取的學生已不在名冊，請重新配對。',true);return;}
  if(replaceExisting&&!importTarget){lifeEduToast_('找不到唯一的已匯入附件關聯；請到第五步以「更新內容」處理該生掃描。',true);return;}
  var identityWarnings=[],classRaw=String(page.className||'').trim(),ocrClass=lifeEduNormalizeClassName_(classRaw),studentClass=lifeEduNormalizeClassName_(row.className),ocrNumber=String(page.classNumber||'').trim(),validNumber=lifeEduValidClassNumber_(ocrNumber);
  if(ocrClass&&studentClass&&ocrClass!==studentClass)identityWarnings.push('班別 OCR「'+page.className+'」／第三步配對「'+row.className+'」');if(classRaw&&!ocrClass)identityWarnings.push('OCR 班別格式無法辨認：「'+page.className+'」');if(validNumber&&Number(ocrNumber)!==Number(row.classNumber))identityWarnings.push('班號 OCR「'+ocrNumber+'」／第三步配對「'+row.classNumber+'」');if(!ocrClass||!validNumber)identityWarnings.push('OCR 未能確認完整班別及 1 至 999 的班號');if(page.studentName&&row.nameZh&&String(page.studentName).trim()!==String(row.nameZh).trim())identityWarnings.push('姓名 OCR「'+page.studentName+'」／第三步配對「'+row.nameZh+'」');if(identityWarnings.length&&!window.confirm('OCR 身份候選與第三步配對需人工核實：'+identityWarnings.join('；')+'。仍要將此頁連到 '+row.className+' 第'+row.classNumber+'號嗎？'))return;
  if(row.scanVersions!=null&&!Array.isArray(row.scanVersions)){lifeEduToast_('此學生的掃描版本資料格式不正確，未匯入此頁。',true);return;}if((row.scanVersions||[]).length>=100){lifeEduToast_('此學生的掃描版本已達100份上限；未匯入。',true);return;}
  if(!Array.isArray(row.articlePageRecords))row.articlePageRecords=[];if(!replaceExisting&&row.articlePageRecords.length>=100){lifeEduToast_('此學生的逐頁來源記錄已達100頁。',true);return;}
  var activeVersions=(row.scanVersions||[]).filter(function(item){return item&&item.active;}),invalidVersion=activeVersions.some(function(item){var sheets=Number(item.sheets);return !Number.isInteger(sheets)||sheets<1||sheets>20;}),currentSheets=activeVersions.reduce(function(sum,item){return sum+Number(item.sheets);},0);
  if(invalidVersion||!Number.isInteger(currentSheets)||currentSheets<0||currentSheets>20){lifeEduToast_('此學生現行掃描頁數資料無效或超出20頁；未匯入。',true);return;}
  var replacedSheets=replaceExisting?Number(importTarget.version.sheets)||1:0;if(currentSheets-replacedSheets+1>20){lifeEduToast_('匯入後此學生現行掃描會超過20頁；未匯入。',true);return;}
  var sourceName=page.sourceFileName||workspace.fileName,newSourceSnippet='〔'+sourceName+' 第'+pageNumber+'頁〕\n'+page.ocrText,sourceText=String(row.sourceOcrText||''),oldSnippet='';
  if(replaceExisting){oldSnippet='〔'+importTarget.articleRecord.sourceFileName+' 第'+importTarget.articleRecord.pageNumber+'頁〕\n'+importTarget.articleRecord.ocrText;if(!oldSnippet||sourceText.indexOf(oldSnippet)<0||sourceText.indexOf(oldSnippet)!==sourceText.lastIndexOf(oldSnippet)){lifeEduToast_('找不到唯一的舊 OCR 原文片段；為免改錯文章，請先在第五步核對原文。',true);return;}sourceText=sourceText.replace(oldSnippet,newSourceSnippet);}
  else sourceText=[sourceText,newSourceSnippet].filter(Boolean).join('\n\n');
  if(sourceText.length>20000){lifeEduToast_('匯入後原始 OCR 將超過20,000字；未匯入。',true);return;}
  var verifiedSeparator=row.verifiedOcrText?'\n\n〔續頁：'+sourceName+' 第'+pageNumber+'頁〕\n':'';if(!replaceExisting&&String(row.verifiedOcrText||'').length+verifiedSeparator.length+page.ocrText.length>2800){lifeEduToast_('加入此頁後「核對後 OCR」會超過2,800字；請先整理或分段文章，未有文字被截斷。',true);return;}
  if(!lifeEduAcquireScanImport_(assignedStudentId)){lifeEduToast_('此學生已有掃描匯入進行中，請完成後再重試。',true);return;}page.importing=true;var importButton=document.querySelector('[data-le-import-page="'+pageNumber+'"]'),matchSelect=document.querySelector('[data-le-page-match="'+pageNumber+'"]');if(importButton){importButton.disabled=true;importButton.textContent='匯入中…';}if(matchSelect)matchSelect.disabled=true;
  var pdfStatus=document.getElementById('lePdfStatus'),newAttachmentId='';
  lifeEduWithCrossTabWriteLock_(function(){if(!lifeEduCommitDirtyBeforeAttachment_(pdfStatus))return;lifeEduSetImportMessage_(pdfStatus,'正在建立學生單頁附件…',false);return lifeEduGetPdfSourceBlob_().then(function(blob){if(LIFE_EDU_STATE.pdfWorkspace!==workspace||workspace.sourceFileId!==sourceFileId)throw new Error('匯入期間原稿工作區已變更；此頁未匯入。');return blob.arrayBuffer();}).then(function(buffer){return PDFLib.PDFDocument.load(new Uint8Array(buffer)).then(function(source){return lifeEduMakePdfPage_(source,pageNumber);});}).then(function(bytes){if(LIFE_EDU_STATE.pdfWorkspace!==workspace||workspace.sourceFileId!==sourceFileId||page.assignedStudentId!==assignedStudentId)throw new Error('匯入期間第三步配對或原稿工作區已變更；此頁未匯入。');var id=lifeEduNewFileId_(),fileName=lifeEduSafeFileStem_(workspace.fileName)+'-page-'+String(pageNumber).padStart(3,'0')+'.pdf',record={id:id,fileName:fileName,mimeType:'application/pdf',createdAt:new Date().toISOString(),blob:new Blob([bytes],{type:'application/pdf'})};newAttachmentId=id;return lifeEduAttachmentPut_(record).then(function(){var current=LIFE_EDU_STATE.rows.filter(function(item){return item.id===assignedStudentId;})[0];if(!current)throw new Error('第三步配對的學生已不在名冊；此頁未匯入。');var priorRow=lifeEduClone_(current),priorPage=lifeEduClone_(page),stamp=new Date().toISOString(),snippet='〔'+sourceName+' 第'+pageNumber+'頁〕\n'+page.ocrText,targetNow=replaceExisting?lifeEduFindImportedPageTarget_(page):null,finalSourceText=String(current.sourceOcrText||''),finalVerifiedSeparator=current.verifiedOcrText?'\n\n〔續頁：'+sourceName+' 第'+pageNumber+'頁〕\n':'',pageRecords=Array.isArray(current.articlePageRecords)?current.articlePageRecords:[],newPageRecords;
      if(replaceExisting){if(!targetNow||targetNow.attachmentId!==importTarget.attachmentId)throw new Error('匯入期間原附件關聯已變更；此頁未更新。');var liveOldSnippet='〔'+targetNow.articleRecord.sourceFileName+' 第'+targetNow.articleRecord.pageNumber+'頁〕\n'+targetNow.articleRecord.ocrText;if(!liveOldSnippet||finalSourceText.indexOf(liveOldSnippet)<0||finalSourceText.indexOf(liveOldSnippet)!==finalSourceText.lastIndexOf(liveOldSnippet))throw new Error('目前學生原文已變更，無法唯一找到要替換的頁面片段；請重新載入並核對後重試。');finalSourceText=finalSourceText.replace(liveOldSnippet,snippet);newPageRecords=pageRecords.map(function(item){return item.attachmentId===targetNow.attachmentId?Object.assign({},item,{attachmentId:id,sourceFileName:sourceName,pageNumber:pageNumber,ocrText:page.ocrText,importedAt:stamp}):item;});}
      else{newPageRecords=pageRecords.concat([{attachmentId:id,sourceFileName:sourceName,pageNumber:pageNumber,ocrText:page.ocrText,importedAt:stamp}]);finalSourceText=[finalSourceText,snippet].filter(Boolean).join('\n\n');}
      if(finalSourceText.length>20000)throw new Error('學生原始 OCR 超過20,000字；此頁未匯入。');if(!replaceExisting&&String(current.verifiedOcrText||'').length+finalVerifiedSeparator.length+page.ocrText.length>2800)throw new Error('加入此頁後「核對後 OCR」會超過2,800字；此頁未匯入。');
      var versions=(current.scanVersions||[]).map(function(item){return replaceExisting&&item.id===importTarget.attachmentId?Object.assign({},item,{active:false}):item;});versions.push({id:id,kind:replaceExisting?'更新內容':'初次收件',fileName:fileName,mimeType:'application/pdf',size:record.blob.size,sheets:1,uploadedAt:stamp,active:true});current.articlePageRecords=newPageRecords;current.scanVersions=versions;current.sourceOcrText=finalSourceText;
      if(!replaceExisting){if(!current.verifiedOcrText)current.verifiedOcrText=page.ocrText;else current.verifiedOcrText+=finalVerifiedSeparator+page.ocrText;}
      if(page.studentName)current.ocrStudentName=page.studentName;if(page.teacherName)current.ocrTeacherName=page.teacherName;if(page.primarySchool)current.ocrPrimarySchool=page.primarySchool;if(page.uncertainNotes)current.ocrNote=[current.ocrNote,'第'+pageNumber+'頁疑點：'+page.uncertainNotes].filter(Boolean).join('；').slice(0,500);
      page.importedAt=stamp;page.importedAttachmentId=id;page.replacesImportedAttachmentId='';page.replacingImport=false;current.reviewStatus='待老師覆核';current.scannedSheets=String((current.scanVersions||[]).filter(function(version){return version.active;}).reduce(function(sum,version){return sum+Number(version.sheets);},0));
      if(!lifeEduPersistLocalNow_()){var index=LIFE_EDU_STATE.rows.indexOf(current);LIFE_EDU_STATE.rows[index]=priorRow;Object.keys(priorPage).forEach(function(key){page[key]=priorPage[key];});throw new Error('本機記錄未能保存；文章及附件未匯入。');}
      LIFE_EDU_STATE.savedRows=lifeEduClone_(LIFE_EDU_STATE.rows);LIFE_EDU_STATE.dirty=false;lifeEduRender_();var panel=document.getElementById('leImportPanel');if(panel)panel.open=true;lifeEduToast_((replaceExisting?'已更新原匯入頁面':'已匯入來源第'+pageNumber+'頁及 OCR 原文')+'，連到 '+row.className+' 第'+row.classNumber+'號。');
    });});},pdfStatus,'另一個分頁正在處理本機資料；完成後再匯入此頁。',expectedSnapshot).then(function(saved){if(!saved&&newAttachmentId)lifeEduAttachmentDelete_(newAttachmentId);}).finally(function(){lifeEduReleaseScanImport_(assignedStudentId);page.importing=false;var button=document.querySelector('[data-le-import-page="'+pageNumber+'"]'),select=document.querySelector('[data-le-page-match="'+pageNumber+'"]');if(button){var currentPage=lifeEduGetPdfPage_(pageNumber);if(currentPage&&currentPage.importedAt&&!currentPage.replacingImport){button.disabled=true;button.textContent='已匯入 '+currentPage.importedAt.slice(0,10);}else{button.disabled=!(currentPage&&currentPage.assignedStudentId&&currentPage.ocrText);button.textContent=currentPage&&currentPage.replacingImport?'更新已匯入文章':'匯入配對文章';}}if(select)select.disabled=Boolean(lifeEduGetPdfPage_(pageNumber)&&lifeEduGetPdfPage_(pageNumber).importedAt);});
}
function lifeEduHandleScanFile_(event){var file=event.target.files&&event.target.files[0],name=document.getElementById('leScanFileName'),status=document.getElementById('leScanStatus');if(!file)return;if(file.size>100*1024*1024){lifeEduSetImportMessage_(status,'掃描檔超過 100 MB。',true);event.target.value='';return;}if(name)name.textContent=file.name;var valid=/\.pdf$/i.test(file.name)||/\.(jpe?g|png|webp)$/i.test(file.name)||['application/pdf','image/jpeg','image/png','image/webp'].indexOf(file.type)>=0;if(!valid){lifeEduSetImportMessage_(status,'只接受 PDF、JPEG、PNG 或 WebP 掃描檔。',true);event.target.value='';if(name)name.textContent='未選擇掃描檔';return;}lifeEduSetImportMessage_(status,'掃描檔已選取；保存時會保留版本。',false);}
function lifeEduUploadScan_(){
  var fileInput=document.getElementById('leScanFile'),kindInput=document.getElementById('leScanKind'),status=document.getElementById('leScanStatus'),button=document.querySelector('[data-le-upload-scan]'),file=fileInput&&fileInput.files&&fileInput.files[0],row=lifeEduSelected_();
  if(!row){lifeEduSetImportMessage_(status,'請先選擇學生。',true);return;}
  if(!file){lifeEduSetImportMessage_(status,'請先選擇掃描 PDF／影像。',true);return;}
  var expectedSnapshot=localStorage.getItem(LIFE_EDU_LOCAL_KEY);
  if(row.scanVersions!=null&&!Array.isArray(row.scanVersions)){lifeEduSetImportMessage_(status,'此學生的掃描版本資料格式不正確，未保存附件。',true);return;}
  if((row.scanVersions||[]).length>=100){lifeEduSetImportMessage_(status,'此學生的掃描版本已達100份上限，未保存附件。請先整理歷史版本。',true);return;}
  var kind=kindInput&&kindInput.value==='更新內容'?'更新內容':'補交',existing=(row.scanVersions||[]).filter(function(item){return item&&item.active;}),invalidExisting=existing.some(function(item){var sheets=Number(item.sheets);return !Number.isInteger(sheets)||sheets<1||sheets>20;}),currentActiveSheets=existing.reduce(function(sum,item){return sum+Number(item.sheets);},0);
  if(kind!=='更新內容'&&(invalidExisting||!Number.isInteger(currentActiveSheets)||currentActiveSheets<0||currentActiveSheets>20)){lifeEduSetImportMessage_(status,'此學生現行掃描頁數資料無效或超出20頁，未保存附件。',true);return;}
  if(kind==='更新內容'&&existing.length&&!window.confirm('更新內容會把 '+existing.length+' 個現行附件標為舊版本，保留檔案但只用新掃描作現行內容。確定更新？'))return;
  if(!lifeEduAcquireScanImport_(row.id)){lifeEduSetImportMessage_(status,'此學生已有掃描匯入進行中，請完成後再重試。',true);return;}
  if(button){button.disabled=true;button.textContent='保存中…';}
  var type=/\.pdf$/i.test(file.name)?'application/pdf':/\.jpe?g$/i.test(file.name)?'image/jpeg':/\.png$/i.test(file.name)?'image/png':/\.webp$/i.test(file.name)?'image/webp':file.type;
  var countPromise=Promise.resolve().then(function(){if(type!=='application/pdf')return 1;return file.arrayBuffer().then(function(buffer){if(typeof PDFLib==='undefined')throw new Error('PDF 元件未載入。');return PDFLib.PDFDocument.load(new Uint8Array(buffer)).then(function(doc){return doc.getPageCount();});});});
  var work=function(){
    if(!lifeEduCommitDirtyBeforeAttachment_(status))return;
    lifeEduSetImportMessage_(status,'正在檢查頁數並保存到此瀏覽器…',false);
    return countPromise.then(function(sheets){
      if(!Number.isInteger(sheets)||sheets<1||sheets>20)throw new Error('每份掃描最多 20 頁，請分批上載。');
      var baseSheets=kind==='更新內容'?0:currentActiveSheets;
      if(baseSheets+sheets>20)throw new Error('加入後現行掃描超過20頁；請改用「更新內容」或分批核對。');
      var id=lifeEduNewFileId_(),record={id:id,fileName:file.name,mimeType:type,createdAt:new Date().toISOString(),blob:new Blob([file],{type:type})};
      return lifeEduAttachmentPut_(record).then(function(){
        var current=LIFE_EDU_STATE.rows.filter(function(item){return item.id===row.id;})[0];
        if(!current)return lifeEduAttachmentDelete_(id).then(function(){throw new Error('學生記錄已變更；此附件未保存。');});
        var previous=lifeEduClone_(current),versions=(current.scanVersions||[]).map(function(item){return kind==='更新內容'?Object.assign({},item,{active:false}):item;});
        versions.push({id:id,kind:kind,fileName:file.name,mimeType:type,size:file.size,sheets:sheets,uploadedAt:record.createdAt,active:true});
        current.scanVersions=versions;
        current.scannedSheets=String(versions.filter(function(item){return item.active;}).reduce(function(sum,item){return sum+Number(item.sheets);},0));
        current.reviewStatus=current.reviewStatus==='已完成'?'待老師覆核':current.reviewStatus;
        if(!lifeEduPersistLocalNow_()){
          var index=LIFE_EDU_STATE.rows.indexOf(current);LIFE_EDU_STATE.rows[index]=previous;
          return lifeEduAttachmentDelete_(id).then(function(){throw new Error('本機記錄未能保存；掃描附件未加入。');});
        }
        LIFE_EDU_STATE.savedRows=lifeEduClone_(LIFE_EDU_STATE.rows);LIFE_EDU_STATE.dirty=false;lifeEduRender_();
        lifeEduToast_((kind==='更新內容'?'已保存更新版本，舊版仍可下載。':'已保存補交掃描。')+' 現行共 '+current.scannedSheets+' 頁。');
      });
    }).catch(function(error){lifeEduSetImportMessage_(status,error.message||String(error),true);});
  };
  lifeEduWithCrossTabWriteLock_(work,status,'另一個分頁正在處理本機資料；完成後再保存此掃描。',expectedSnapshot).finally(function(){
    lifeEduReleaseScanImport_(row.id);
    if(button){button.disabled=false;button.textContent='保存掃描版本';}
  });
}

function lifeEduHandleDataFile_(event){
  var message=document.getElementById('leImportMessage');if(lifeEduAnyScanImportLocked_()){lifeEduSetImportMessage_(message,'掃描匯入仍在進行；完成後再匯入檔案。',true);event.target.value='';return;}var file=event.target.files&&event.target.files[0];if(!file)return;var label=document.getElementById('leDataName');if(label)label.textContent=file.name;if(message){message.className='le-import-message';message.textContent='讀取中…';}
  if(file.size>(/\.zip$/i.test(file.name)?200:20)*1024*1024){lifeEduSetImportMessage_(message,/\.zip$/i.test(file.name)?'完整備份 ZIP 不得大於 200 MB。':'資料檔超過 20 MB，請先分批匯入。',true);event.target.value='';return;}
  var countError=lifeEduCountValidationError_(lifeEduCurrentForm_());if(countError){var saveMsg=document.getElementById('leSaveMsg');if(saveMsg){saveMsg.textContent=countError+' 更正後才可繼續。';saveMsg.classList.add('error');}lifeEduSetImportMessage_(message,countError+' 更正後才可匯入資料。',true);event.target.value='';return;}
  function continueImport_(){
    if(/\.zip$/i.test(file.name)){lifeEduRestoreBackupZipFile_(file,message).finally(function(){event.target.value='';});return;}
    if(/\.xlsx?$/i.test(file.name)){
      file.arrayBuffer().then(lifeEduReadWorkbookRows_).then(function(result){if(!result.rows.length){lifeEduSetImportMessage_(message,result.sourceInfo||'沒有可匯入的學生資料。',true);return;}lifeEduImportRows_(result.rows,message,result);}).catch(function(error){lifeEduSetImportMessage_(message,error.message||'無法讀取 Excel 工作簿。',true);}).finally(function(){event.target.value='';});return;
    }
    var reader=new FileReader();reader.onload=function(){try{var imported=/\.csv$|\.txt$/i.test(file.name)?lifeEduParseCsv_(String(reader.result||'')):JSON.parse(String(reader.result||''));if(imported&&imported.format==='life-edu-local-backup'){lifeEduRestoreBackup_(imported,message);return;}var rawRows=Array.isArray(imported)?imported:(imported.rows||imported.records||imported.students||(imported.article?[imported.article]:[]));if(imported&&Array.isArray(imported.pages))rawRows=imported.pages;if(rawRows.length&&rawRows[0]&&rawRows[0].page!==undefined&&rawRows[0].ocrText!==undefined){var grouped=lifeEduGroupOcrPageRows_(rawRows);if(!grouped.rows.length){var reasons=[];if(grouped.unresolved)reasons.push(grouped.unresolved+'頁缺少可用班別／班號');if(grouped.conflicted)reasons.push(grouped.conflicted+'頁的候選身份不一致');if(grouped.oversized)reasons.push(grouped.oversized+'頁因合併後超過2,800字而未匯入');throw new Error('OCR JSON 沒有可安全批次匯入的頁面（'+reasons.join('；')+'）；請逐頁核實身份後貼入。');}lifeEduImportRows_(grouped.rows,message,grouped);return;}var rows=rawRows.map(lifeEduNormalizeImportRow_);if(!rows.length)throw new Error('未找到學生記錄。請使用 CSV 或 JSON 資料。');lifeEduImportRows_(rows,message);}catch(error){lifeEduSetImportMessage_(message,error.message||String(error),true);}finally{event.target.value='';}};reader.onerror=function(){lifeEduSetImportMessage_(message,'無法讀取檔案。',true);event.target.value='';};reader.readAsText(file,'UTF-8');
  }
  if(LIFE_EDU_STATE.dirty){if(!window.confirm('目前學生有未儲存更改。匯入前會先保存目前編輯，是否繼續？')){event.target.value='';if(message)message.textContent='已取消匯入。';return;}lifeEduApplyFormToRow_();lifeEduPersistLocal_().then(function(saved){if(!saved){event.target.value='';lifeEduSetImportMessage_(message,'本機記錄未能保存，已停止匯入。',true);return;}LIFE_EDU_STATE.savedRows=lifeEduClone_(LIFE_EDU_STATE.rows);LIFE_EDU_STATE.dirty=false;continueImport_();});return;}
  continueImport_();
}
function lifeEduReadWorkbookRows_(buffer){
  if(!window.XLSX||typeof window.XLSX.read!=='function'||!window.XLSX.utils||typeof window.XLSX.utils.sheet_to_json!=='function')throw new Error('Excel 元件未載入；請檢查網絡連線後重新整理頁面。');
  var workbook;
  try{workbook=window.XLSX.read(buffer,{type:'array',cellDates:false,cellHTML:false,cellFormula:false});}catch(error){throw new Error('無法解析 Excel；請確認檔案是有效的 .xlsx 或 .xls。');}
  var rows=[],schoolLookupRows=[],sheetNames=[],schoolSheetNames=[],identities=Object.create(null),rosterSchoolNames=Object.create(null),rosterSchoolRows=0,headerLimit=100;
  (workbook.SheetNames||[]).forEach(function(sheetName){
    var sheet=workbook.Sheets[sheetName];if(!sheet)return;
    var matrix=window.XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false,blankrows:true});if(!Array.isArray(matrix)||!matrix.length)return;
    var headerIndex=-1,headerKeys=null,headerKind='',schoolHeaderIndex=-1,schoolHeaderKeys=null;
    for(var scanIndex=0;scanIndex<Math.min(matrix.length,headerLimit);scanIndex++){
      var candidate=lifeEduMapRosterHeaderRow_(matrix[scanIndex]);
      if(candidate){headerIndex=scanIndex;headerKeys=candidate;headerKind='roster';break;}
      var schoolCandidate=lifeEduMapSchoolLookupHeaderRow_(matrix[scanIndex]);
      if(schoolCandidate&&schoolHeaderIndex<0){schoolHeaderIndex=scanIndex;schoolHeaderKeys=schoolCandidate;}
    }
    if(headerIndex<0&&schoolHeaderIndex>=0){headerIndex=schoolHeaderIndex;headerKeys=schoolHeaderKeys;headerKind='schoolLookup';}
    if(headerIndex<0)return;
    var headerCells=matrix[headerIndex]||[],ambiguousHeaders=headerKeys.reduce(function(list,key,index){if(key==='__ambiguous__')list.push(String(headerCells[index]||'未知欄名'));return list;},[]);if(ambiguousHeaders.length)throw new Error('工作表「'+sheetName+'」有無法判斷語義的姓名欄：'+ambiguousHeaders.map(function(label){return '「'+label+'」';}).join('、')+'；請明確標示中文或英文姓名後再匯入。');
    var firstColumnByKey=Object.create(null),duplicateHeaders=[];headerKeys.forEach(function(key,columnIndex){if(!key)return;if(firstColumnByKey[key]!==undefined)duplicateHeaders.push('「'+String(headerCells[firstColumnByKey[key]]||key)+'」和「'+String(headerCells[columnIndex]||key)+'」');else firstColumnByKey[key]=columnIndex;});
    if(duplicateHeaders.length)throw new Error('工作表「'+sheetName+'」標題列有重複或容易混淆的欄位：'+duplicateHeaders.join('、')+'。請每種資料只保留一欄後再匯入。');
    for(var rowIndex=headerIndex+1;rowIndex<matrix.length;rowIndex++){
      var cells=matrix[rowIndex]||[];
      if(!cells.some(function(value){return value!==null&&value!==undefined&&String(value).trim()!=='';}))continue;
      var raw={};cells.forEach(function(value,columnIndex){var key=headerKeys[columnIndex];if(key&&value!==null&&value!==undefined&&String(value).trim()!=='')raw[key]=value;});
      var normalized=lifeEduNormalizeImportRow_(raw);
      if(headerKind==='schoolLookup'){
        if(!String(normalized.nameZh||'').trim()&&!String(normalized.nameEn||'').trim()&&!String(normalized.primarySchool||'').trim())continue;
        schoolLookupRows.push({nameZh:normalized.nameZh||'',nameEn:normalized.nameEn||'',primarySchool:String(normalized.primarySchool||'').trim()});
        continue;
      }
      var className=String(normalized.className||'').trim(),classNumber=String(normalized.classNumber==null?'':normalized.classNumber).trim();
      if(!className||!lifeEduValidClassNumber_(classNumber))throw new Error('工作表「'+sheetName+'」資料第 '+(rowIndex+1)+' 行缺少有效的「班別」或「班號」；整份 Excel 未匯入。');
      var normalizedClass=lifeEduNormalizeClassName_(className)||className.toUpperCase().replace(/\s/g,''),identity=normalizedClass+'-'+Number(classNumber);
      if(identities[identity])throw new Error('Excel 內有重複學生：'+className+' 第'+Number(classNumber)+'號；整份檔案未匯入。');identities[identity]=true;
      var school=String(normalized.primarySchool||'').trim();if(school){rosterSchoolRows++;rosterSchoolNames[school]=true;}
      rows.push(normalized);
    }
    if(headerKind==='schoolLookup')schoolSheetNames.push(sheetName);else sheetNames.push(sheetName);
  });
  if(!sheetNames.length&&!schoolSheetNames.length)throw new Error('找不到可識別的名冊或小學資料表。已搜尋每張工作表的首 '+headerLimit+' 列；學生名冊需有「班別」和「班號」，小學資料表需有中文／英文姓名及小學欄。');
  var schoolLookupStats=null;
  if(schoolLookupRows.length){
    var matchRoster=[],matchSeen=Object.create(null);
    LIFE_EDU_STATE.savedRows.concat(rows).forEach(function(item){var className=String(item.className||'').trim(),classNumber=String(item.classNumber==null?'':item.classNumber).trim();if(!className||!lifeEduValidClassNumber_(classNumber))return;var identity=className+'-'+Number(classNumber);if(matchSeen[identity]){var index=matchSeen[identity]-1;matchRoster[index]=Object.assign({},matchRoster[index],item);return;}matchSeen[identity]=matchRoster.push(item);});
    schoolLookupStats=lifeEduMatchSchoolLookupRows_(schoolLookupRows,matchRoster);rows=rows.concat(schoolLookupStats.rows);
  }
  if(!rows.length){
    if(schoolLookupStats){
      var lookupSummary=lifeEduDescribeSchoolLookup_(schoolLookupStats);
      var rosterHint=matchRoster&&matchRoster.length?'請核對已載入名冊的中英文姓名；只有吻合且唯一的學生會自動配對。':'請先匯入含班別和班號的學生名冊，再匯入這份小學資料表。';
      throw new Error('已辨認到小學資料表，但沒有可安全更新的學生。'+lookupSummary+(rosterHint?' '+rosterHint:''));
    }
    if(!sheetNames.length)throw new Error('已找到名冊標題列，但標題下方沒有學生資料。');
    throw new Error('已找到名冊標題列，但沒有可匯入的學生資料。');
  }
  var sourceInfo=[];
  if(sheetNames.length)sourceInfo.push('Excel 已讀取 '+sheetNames.length+' 個正式名冊工作表；其中 '+rosterSchoolRows+' 列有小學名稱（'+Object.keys(rosterSchoolNames).length+' 個不同名稱）');
  if(schoolLookupStats)sourceInfo.push('小學資料按姓名配對：'+lifeEduDescribeSchoolLookup_(schoolLookupStats));
  return {rows:rows,sourceInfo:sourceInfo.join('；'),schoolLookup:schoolLookupStats};
}
function lifeEduMapRosterHeaderRow_(cells){if(!Array.isArray(cells))return null;var keys=cells.map(lifeEduCanonicalImportHeaderKey_);return keys.indexOf('className')>=0&&keys.indexOf('classNumber')>=0?keys:null;}
function lifeEduMapSchoolLookupHeaderRow_(cells){if(!Array.isArray(cells))return null;var keys=cells.map(lifeEduCanonicalImportHeaderKey_);return keys.indexOf('primarySchool')>=0&&(keys.indexOf('nameZh')>=0||keys.indexOf('nameEn')>=0)?keys:null;}
function lifeEduSchoolLookupNameKey_(value,language){var text=String(value==null?'':value);if(typeof text.normalize==='function')text=text.normalize('NFKC');text=text.trim();return language==='zh'?text.replace(/\s+/g,''):text.replace(/\s+/g,' ').toLowerCase();}
function lifeEduMatchSchoolLookupRows_(lookupRows,rosterRows){
  var zhIndex=Object.create(null),enIndex=Object.create(null),matched=Object.create(null),conflicted=Object.create(null),result=[];
  function identityOf_(row){return lifeEduStudentId_(String(row.className||'').trim(),String(row.classNumber||'').trim());}
  function addIndex_(index,key,row){if(!key)return;var id=identityOf_(row);if(!index[key])index[key]=[];if(!index[key].some(function(item){return identityOf_(item)===id;}))index[key].push(row);}
  rosterRows.forEach(function(row){addIndex_(zhIndex,lifeEduSchoolLookupNameKey_(row.nameZh,'zh'),row);addIndex_(enIndex,lifeEduSchoolLookupNameKey_(row.nameEn,'en'),row);});
  var stats={rows:result,matched:0,unmatched:0,ambiguous:0,missingSchool:0,missingName:0};
  lookupRows.forEach(function(raw){
    var row=lifeEduNormalizeImportRow_(raw),school=String(row.primarySchool||'').trim(),zhKey=lifeEduSchoolLookupNameKey_(row.nameZh,'zh'),enKey=lifeEduSchoolLookupNameKey_(row.nameEn,'en');
    if(!school){stats.missingSchool++;return;}
    if(!zhKey&&!enKey){stats.missingName++;return;}
    var zhMatches=zhKey?(zhIndex[zhKey]||[]):null,enMatches=enKey?(enIndex[enKey]||[]):null,candidates=[];
    if(zhKey&&enKey){
      if(!zhMatches.length&&!enMatches.length){stats.unmatched++;return;}
      if(!zhMatches.length||!enMatches.length){stats.ambiguous++;return;}
      candidates=zhMatches.filter(function(item){return enMatches.some(function(other){return identityOf_(item)===identityOf_(other);});});
    }else candidates=(zhKey?zhMatches:enMatches)||[];
    if(candidates.length!==1){if(candidates.length>1||((zhKey&&enKey)&&(zhMatches.length||enMatches.length)))stats.ambiguous++;else stats.unmatched++;return;}
    var student=candidates[0],id=identityOf_(student);
    if(conflicted[id])return;
    if(matched[id]){if(matched[id].primarySchool!==school){delete matched[id];conflicted[id]=true;stats.ambiguous++;}return;}
    matched[id]={className:String(student.className||'').trim(),classNumber:Number(student.classNumber),primarySchool:school};stats.matched++;
  });
  stats.rows=Object.keys(matched).map(function(id){return matched[id];});stats.matched=stats.rows.length;
  return stats;
}
function lifeEduDescribeSchoolLookup_(stats){return '配對成功 '+Number(stats.matched||0)+' 人，找不到 '+Number(stats.unmatched||0)+' 人，姓名不一致或不唯一 '+Number(stats.ambiguous||0)+' 人，缺少姓名 '+Number(stats.missingName||0)+' 列，缺少小學名稱 '+Number(stats.missingSchool||0)+' 列；「No.」不作班號。';}

function lifeEduRestoreBackup_(backup,messageNode){
  if(!lifeEduAcquireScanImport_('__data_import__')){lifeEduSetImportMessage_(messageNode,'本機掃描或匯入仍在進行；完成後再還原備份。',true);return Promise.resolve(false);}
  var expectedSnapshot=localStorage.getItem(LIFE_EDU_LOCAL_KEY);
  return lifeEduWithCrossTabWriteLock_(function(){return lifeEduRestoreBackupLocked_(backup,messageNode);},messageNode,'另一個分頁正在處理本機資料；完成後再還原備份。',expectedSnapshot).finally(function(){lifeEduReleaseScanImport_('__data_import__');});
}
function lifeEduRestoreBackupLocked_(backup,messageNode){
  var previousState=null,stateApplied=false,persisted=false;
  try{
    lifeEduValidateBackup_(backup);
    if(!window.confirm('這是 JSON 文字備份。還原會取代目前全部學生記錄、設定和範本，但不含 PDF 掃描及色稿影像附件；若要轉移附件，請改用完整備份 ZIP。建議先下載現有完整備份。確定還原？')){lifeEduSetImportMessage_(messageNode,'已取消還原；現有記錄保留。',false);return;}
    previousState={backup:lifeEduLocalBackup_(),selectedId:LIFE_EDU_STATE.selectedId,savedRows:lifeEduClone_(LIFE_EDU_STATE.savedRows),dirty:LIFE_EDU_STATE.dirty};lifeEduApplyBackup_(backup);stateApplied=true;LIFE_EDU_STATE.selectedId=LIFE_EDU_STATE.rows[0]&&LIFE_EDU_STATE.rows[0].id||'';LIFE_EDU_STATE.dirty=false;
    if(!lifeEduPersistLocalNow_())throw new Error('本機儲存空間不足，已保留還原前記錄。');persisted=true;
    LIFE_EDU_STATE.savedRows=lifeEduClone_(LIFE_EDU_STATE.rows);lifeEduRender_();var currentMessage=document.getElementById('leImportMessage');lifeEduSetImportMessage_(currentMessage,'JSON 文字備份已還原；PDF 附件需從完整 ZIP 備份另行還原。',false);var importPanel=document.getElementById('leImportPanel');if(importPanel)importPanel.open=true;lifeEduToast_('JSON 文字備份已還原。');
  }catch(error){if(stateApplied&&!persisted&&previousState){try{lifeEduApplyBackup_(previousState.backup);LIFE_EDU_STATE.selectedId=previousState.selectedId;LIFE_EDU_STATE.savedRows=previousState.savedRows;LIFE_EDU_STATE.dirty=previousState.dirty;lifeEduRender_();}catch(restoreError){error=new Error((error.message||'備份還原失敗。')+'；恢復原畫面失敗：'+(restoreError.message||'請重新載入頁面。'));}}var currentMessage=document.getElementById('leImportMessage')||messageNode;lifeEduSetImportMessage_(currentMessage,error.message||'備份還原失敗。',true);}
}
function lifeEduSetImportMessage_(node,message,error){if(!node)return;node.textContent=message;node.className='le-import-message'+(error?' error':'');}
function lifeEduStripOcrContact_(text){return String(text||'').replace(/聯絡(?:方法|資料)\s*[:：][\s\S]*?(?=姓名\s*[:：]|$)/gi,'〔聯絡資料略〕 ').replace(/\b(?:\d[\s-]?){7}\d\b/g,'〔電話號碼略〕');}
function lifeEduGroupOcrPageRows_(pages){
  var byPage={},groups={},unresolved=0,conflicted=0,oversized=0,namesByStudent={},conflictedStudents={},rosterClasses=[];
  LIFE_EDU_STATE.rows.forEach(function(row){var name=String(row.className||'').trim();if(name&&rosterClasses.indexOf(name)<0)rosterClasses.push(name);});
  (pages||[]).forEach(function(raw,index){if(!raw||typeof raw!=='object')return;var p=Number(raw.page);var key=Number.isInteger(p)&&p>0?String(p):'row-'+index;byPage[key]=raw;});
  function pageClass_(page){var value=String(page.className||page.class||page.classLabel||'').trim();if(!value&&rosterClasses.length===1)value=rosterClasses[0];return value;}
  function studentKey_(page){var raw=String(page.classNumber==null?'':page.classNumber).trim(),className=pageClass_(page);if(!className||!/^[1-9]\d{0,2}$/.test(raw))return '';return lifeEduStudentId_(className,raw);}
  Object.keys(byPage).forEach(function(key){var p=byPage[key],id=studentKey_(p),name=String(p.studentName||'').trim().replace(/\s+/g,'');if(!id||!name||/^(無法辨認|手寫姓名無法辨認|未能辨認|不明|\?+|[-—]+)$/i.test(name))return;if(!namesByStudent[id])namesByStudent[id]=[];if(namesByStudent[id].indexOf(name)<0)namesByStudent[id].push(name);});
  Object.keys(namesByStudent).forEach(function(id){if(namesByStudent[id].length>1)conflictedStudents[id]=true;});
  Object.keys(byPage).sort(function(a,b){var an=Number(a),bn=Number(b);if(Number.isNaN(an))return 1;if(Number.isNaN(bn))return -1;return an-bn;}).forEach(function(key){var p=byPage[key],id=studentKey_(p);if(!id){unresolved++;return;}if(conflictedStudents[id]){conflicted++;return;}var n=Number(p.classNumber),className=pageClass_(p);if(!groups[id])groups[id]={id:id,className:className,classNumber:n,pages:[],names:[],teachers:[],schools:[],notes:[]};var g=groups[id];g.pages.push({page:Number(p.page)||0,text:lifeEduStripOcrContact_(p.ocrText||'')});[['studentName',g.names],['teacherName',g.teachers],['primarySchool',g.schools]].forEach(function(pair){var v=String(p[pair[0]]||'').trim();if(v&&pair[1].indexOf(v)<0)pair[1].push(v);});if(p.uncertainNotes)g.notes.push(String(p.uncertainNotes));});
  var rows=Object.keys(groups).sort(function(a,b){var left=groups[a],right=groups[b];return left.className.localeCompare(right.className,'zh-Hant')||left.classNumber-right.classNumber;}).map(function(id){var g=groups[id],pageNums=g.pages.map(function(p){return p.page;}).filter(Boolean);var source=g.pages.map(function(p){return '〔OCR'+(p.page?' 第'+p.page+'頁':'')+'〕\n'+p.text;}).filter(function(s){return s.trim();}).join('\n\n');var candidateNotes=['OCR候選；正式身份及文章未覆核。','來源頁碼：'+(pageNums.join('、')||'未標示')].concat(g.notes);return {id:g.id,className:g.className,classNumber:g.classNumber,ocrStudentName:g.names.join('／').slice(0,100),ocrTeacherName:g.teachers.join('／').slice(0,120),ocrPrimarySchool:g.schools.join('／').slice(0,160),sourceOcrText:source,scannedSheets:g.pages.length,reviewStatus:'待身份核對',ocrNote:candidateNotes.join('；').slice(0,500)};}).filter(function(row){if(row.sourceOcrText.length>2800){oversized+=row.scannedSheets;return false;}return true;});
  return {rows:rows,unresolved:unresolved,conflicted:conflicted,oversized:oversized};
}
function lifeEduImportHeadings_(){
  return {className:['班別','班級','class','Class','Class Name','ClassName'],classNumber:['班號','班內編號','classNo','number','Class No','Class No.','Class Number'],studentNumber:['正式學號','學號','studentId','studentNumber','Student ID'],nameZh:['中文姓名OCR','中文姓名','姓名（中文）','姓名（中）','學生姓名（中文）','姓名','nameZh','Chinese Name'],nameEn:['英文姓名','姓名（英文）','姓名（英）','學生姓名（英文）','姓名（English）','English Name','Student Name (ENG)','nameEn'],gender:['性別','gender'],house:['社別','社','house'],primarySchool:['所屬小學','所屬小學名稱','之前就讀小學','曾就讀小學','小學','小學名稱','小學校名','primarySchool','Primary School','Primary School Name'],ocrStudentName:['OCR姓名候選','ocrStudentName'],ocrTeacherName:['OCR老師候選','ocrTeacherName'],ocrPrimarySchool:['OCR小學候選','ocrPrimarySchool'],teacherName:['收件老師','收件老師姓名','老師姓名','教師姓名','老師姓名（中文）','老師姓名（英文）','收件老師姓名（中文）','收件老師姓名（英文）','teacherName'],teacherTitle:['老師職銜','職銜','teacherTitle'],expectedSheets:['應交張數','應交','expectedSheets'],physicalReceived:['紙本已收張數','紙本已收','已收張數','physicalReceived'],scannedSheets:['掃描頁數','掃描頁','scannedSheets'],teacherNote:['批改備註','老師批改備註','teacherNote'],ocrNote:['OCR疑點','OCR／姓名核對記錄','ocrNote'],sourceUrl:['原稿連結','來源掃描連結','sourceUrl'],sourceOcrText:['原始OCR','原始 OCR','sourceOcrText'],verifiedOcrText:['核對後OCR','核對後 OCR','verifiedOcrText'],correctedText:['老師修訂稿','修訂稿','correctedText'],reviewStatus:['文章狀態','reviewStatus'],exempt:['免交','豁免','exempt'],checkSpelling:['錯字已核對','checkSpelling'],checkFlow:['文句已核對','checkFlow'],checkFormat:['格式已核對','checkFormat'],studentFollowup:['待學生澄清','studentFollowup']};
}
function lifeEduNormalizeImportHeading_(value){var text=String(value==null?'':value).replace(/^\uFEFF/,'');if(typeof text.normalize==='function')text=text.normalize('NFKC');text=text.replace(/[（(]\s*(?:必填|必須|選填|可選|required|optional)\s*[）)]/gi,'');return text.replace(/[\s\u200b\u2060_\-./\\:：,，.。*＊()[\]【】]/g,'').toLowerCase();}
function lifeEduCanonicalImportHeaderKey_(value){
  var text=String(value==null?'':value),normalized=lifeEduNormalizeImportHeading_(text);if(!normalized)return '';var headings=lifeEduImportHeadings_();
  for(var key in headings){for(var i=0;i<headings[key].length;i++){if(lifeEduNormalizeImportHeading_(headings[key][i])===normalized)return key;}}
  var normalizedText=text.replace(/^\uFEFF/,'');if(typeof normalizedText.normalize==='function')normalizedText=normalizedText.normalize('NFKC');var withoutParenthetical=normalizedText.replace(/\([^)]*\)/g,'');
  var nameHeaderBase=lifeEduNormalizeImportHeading_(withoutParenthetical),studentNameBases={姓名:true,學生姓名:true,中文姓名:true,英文姓名:true,name:true,studentname:true,chinesename:true,englishname:true};
  if(!/(?:老師|教師|teacher|家長|父親|母親|監護人|parent|guardian|father|mother)/i.test(withoutParenthetical)&&studentNameBases[nameHeaderBase]){
    var annotations=normalizedText.match(/\([^)]*\)/g)||[],annotationText=annotations.join(''),hasEnglish=/(?:english|英(?:文|語))/i.test(annotationText),hasChinese=/(?:chinese|中文|繁體|簡體)/i.test(annotationText);
    if(hasEnglish&&hasChinese)return '__ambiguous__';if(hasEnglish)return 'nameEn';if(hasChinese)return 'nameZh';
  }
  var base=lifeEduNormalizeImportHeading_(withoutParenthetical);if(base&&base!==normalized){for(var field in headings){for(var aliasIndex=0;aliasIndex<headings[field].length;aliasIndex++){if(lifeEduNormalizeImportHeading_(headings[field][aliasIndex])===base)return field;}}}return '';
}
function lifeEduNormalizeImportRow_(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))raw={};
  var headings=lifeEduImportHeadings_(),row={};Object.keys(headings).concat(['id','updatedAt','updatedBy']).forEach(function(key){if(Object.prototype.hasOwnProperty.call(raw,key))row[key]=raw[key];});Object.keys(headings).forEach(function(key){if(row[key]!==undefined)return;for(var i=0;i<headings[key].length;i++){if(Object.prototype.hasOwnProperty.call(raw,headings[key][i])){row[key]=raw[headings[key][i]];break;}}});
  var idMatch=String(row.id||'').match(/^(.*?)-(\d+)$/);if(idMatch){if(!row.className)row.className=idMatch[1];if(!row.classNumber)row.classNumber=Number(idMatch[2]);}
  ['exempt','checkSpelling','checkFlow','checkFormat','studentFollowup'].forEach(function(key){if(row[key]===undefined)return;row[key]=row[key]===true||/^(true|1|yes|y|是|✓)$/i.test(String(row[key]).trim());});
  if(String(row.expectedSheets||'').trim()==='免交'){row.expectedSheets=0;row.exempt=true;}return row;
}

function lifeEduParseCsv_(text){
  var rows=[],row=[],cell='',quoted=false;
  for(var i=0;i<text.length;i++){var c=text.charAt(i);if(quoted){if(c==='"'&&text.charAt(i+1)==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell='';}else if(c==='\n'||c==='\r'){if(c==='\r'&&text.charAt(i+1)==='\n')i++;row.push(cell);cell='';if(row.some(function(v){return v!=='';}))rows.push(row);row=[];}else cell+=c;}
  row.push(cell);if(row.some(function(v){return v!=='';}))rows.push(row);if(rows.length<2)return [];
  var headers=rows.shift().map(function(h){return String(h).replace(/^\ufeff/,'').trim();});return rows.map(function(values){var out={};headers.forEach(function(h,index){out[h]=values[index]===undefined?'':values[index];});return out;});
}
function lifeEduImportRows_(rows,messageNode,warnings){
  if(!lifeEduAcquireScanImport_('__data_import__')){lifeEduSetImportMessage_(messageNode,'本機掃描或匯入仍在進行；完成後再匯入名單或文章資料。',true);return Promise.resolve(false);}
  var expectedSnapshot=localStorage.getItem(LIFE_EDU_LOCAL_KEY);
  return lifeEduWithCrossTabWriteLock_(function(){return lifeEduImportRowsLocked_(rows,messageNode,warnings);},messageNode,'另一個分頁正在處理本機資料；完成後再匯入名單或文章資料。',expectedSnapshot).finally(function(){lifeEduReleaseScanImport_('__data_import__');});
}
function lifeEduImportRowsLocked_(rows,messageNode,warnings){
  var unresolved=Number(warnings&&warnings.unresolved)||0,conflicted=Number(warnings&&warnings.conflicted)||0,oversized=Number(warnings&&warnings.oversized)||0,sourceInfo=String(warnings&&warnings.sourceInfo||'').trim();
  var textKeys=['sourceOcrText','verifiedOcrText','correctedText'],conflicts=[],textLimits={studentNumber:2000,nameZh:2000,nameEn:2000,gender:2000,house:2000,primarySchool:2000,ocrStudentName:2000,ocrTeacherName:2000,ocrPrimarySchool:2000,teacherName:2000,teacherTitle:2000,teacherNote:2000,ocrNote:2000,sourceUrl:2000,sourceOcrText:20000,verifiedOcrText:20000,correctedText:20000,updatedAt:2000,updatedBy:2000};
  rows.forEach(function(raw){var normalized=lifeEduNormalizeImportRow_(raw);Object.keys(textLimits).forEach(function(key){if(normalized[key]===undefined||normalized[key]===null)return;var value=normalized[key];if(typeof value!=='string'&&typeof value!=='number'&&typeof value!=='boolean')throw new Error('匯入列 '+key+' 必須是文字。');if(String(value).length>textLimits[key])throw new Error('匯入列 '+key+' 超過 '+textLimits[key]+' 字；沒有套用任何資料，請分段匯入。');});['expectedSheets','physicalReceived','scannedSheets'].forEach(function(key){var value=normalized[key];if(value===undefined||value===null||value==='')return;if(typeof value!=='string'&&typeof value!=='number')throw new Error('匯入列 '+key+' 必須是 0 至 20 的整數或留空。');var rawValue=String(value).trim();if(!/^\d{1,2}$/.test(rawValue)||Number(rawValue)>20)throw new Error('匯入列 '+key+' 必須是 0 至 20 的整數或留空；沒有套用任何資料。');});});
  rows.forEach(function(incoming){var normalized=lifeEduNormalizeImportRow_(incoming),current=LIFE_EDU_STATE.savedRows.filter(function(r){return String(r.className||'').trim()===String(normalized.className||'').trim()&&Number(r.classNumber)===Number(normalized.classNumber);})[0];if(!current)return;textKeys.forEach(function(key){if(incoming[key]!==undefined&&current[key]&&String(incoming[key])!==String(current[key]))conflicts.push(String(normalized.className||'')+' 第'+incoming.classNumber+'號 '+key);});});
  if(conflicts.length&&!window.confirm('匯入會覆蓋現有文章文字（'+conflicts.length+'項），例如 '+conflicts.slice(0,4).join('、')+'。已先匯出 JSON 備份嗎？確定繼續？')){lifeEduSetImportMessage_(messageNode,'已取消匯入；現有文章保留。',false);return;}
  var merged=lifeEduClone_(LIFE_EDU_STATE.savedRows),updated=0,previousState={rows:lifeEduClone_(LIFE_EDU_STATE.rows),savedRows:lifeEduClone_(LIFE_EDU_STATE.savedRows),selectedId:LIFE_EDU_STATE.selectedId,dirty:LIFE_EDU_STATE.dirty,importing:LIFE_EDU_STATE.importing};
  try{
    rows.forEach(function(raw){var incoming=lifeEduNormalizeImportRow_(raw),number=Number(incoming.classNumber),className=String(incoming.className||'').trim();if(!className||!Number.isInteger(number)||number<1||number>999)throw new Error('每列必須有班別和 1 至 999 的班號；未能辨認的 OCR 頁請逐頁選取學生後貼入。');incoming.className=className;incoming.classNumber=number;incoming.id=incoming.id||lifeEduStudentId_(className,number);var index=merged.findIndex(function(item){return item.id===incoming.id||(String(item.className||'').trim()===className&&Number(item.classNumber)===number);});if(index<0){var initial={id:incoming.id,className:className,classNumber:number,expectedSheets:'',physicalReceived:'',scannedSheets:'',reviewStatus:'待身份核對',exempt:false};merged.push(Object.assign(initial,incoming));}else{var next=Object.assign({},merged[index]);Object.keys(incoming).forEach(function(key){var value=incoming[key];if(value!==undefined&&value!==null&&value!=='')next[key]=value;});merged[index]=next;}updated++;});
    merged.sort(function(a,b){return String(a.className||'').localeCompare(String(b.className||''),'zh-Hant')||Number(a.classNumber)-Number(b.classNumber);});
    LIFE_EDU_STATE.rows=merged;LIFE_EDU_STATE.savedRows=lifeEduClone_(merged);LIFE_EDU_STATE.dirty=false;LIFE_EDU_STATE.importing=false;
    if(!LIFE_EDU_STATE.rows.some(function(r){return r.id===LIFE_EDU_STATE.selectedId;}))LIFE_EDU_STATE.selectedId=LIFE_EDU_STATE.rows[0]&&LIFE_EDU_STATE.rows[0].id||'';
    if(!lifeEduPersistLocalNow_())throw new Error('本機記錄無法保存；請先匯出 JSON 備份。');
    var detailsText=[];if(unresolved)detailsText.push('另有 '+unresolved+' 頁缺少可用班號，未自動配對，請逐頁核實');if(conflicted)detailsText.push(conflicted+' 頁因同一候選班號出現不同姓名而未合併，請逐頁核實');if(oversized)detailsText.push(oversized+' 頁因合併後超過2,800字而未匯入');var msg='已合併 '+updated+' 列；未列出的學生資料保留。'+(sourceInfo?' '+sourceInfo:'')+(detailsText.length?'；'+detailsText.join('；'):'');lifeEduSetImportMessage_(messageNode,msg,false);lifeEduRender_();var details=document.getElementById('leImportPanel');if(details)details.open=true;lifeEduToast_(msg);
  }catch(error){LIFE_EDU_STATE.rows=previousState.rows;LIFE_EDU_STATE.savedRows=previousState.savedRows;LIFE_EDU_STATE.selectedId=previousState.selectedId;LIFE_EDU_STATE.dirty=previousState.dirty;LIFE_EDU_STATE.importing=previousState.importing;lifeEduSetImportMessage_(messageNode,error.message||'匯入失敗。',true);}
}

function lifeEduHandleOcrImageFile_(event){
  var file=event.target.files&&event.target.files[0],name=document.getElementById('leOcrImageName'),status=document.getElementById('leMiniMaxStatus');if(!file)return;
  if(name)name.textContent=file.name;if(file.size>5*1024*1024){if(status)status.textContent='影像超過5 MB，請先縮小或裁剪。';lifeEduToast_('單頁影像不得大於5 MB。',true);event.target.value='';if(name)name.textContent='未選擇影像';return;}if(status)status.textContent='影像已選取；按「送 MiniMax OCR」後會轉送處理。';
}
function lifeEduRunMiniMaxOcr_(){
  var key=document.getElementById('leMiniMaxKey'),fileInput=document.getElementById('leOcrImage'),pageInput=document.getElementById('leOcrPageNumber'),button=document.querySelector('[data-le-minimax-ocr]'),status=document.getElementById('leMiniMaxStatus');var file=fileInput&&fileInput.files&&fileInput.files[0];
  if(!key||!key.value.trim()){if(status)status.textContent='請在本頁輸入 MiniMax API key。';return;}if(!file){if(status)status.textContent='請先選取一張文章掃描影像。';return;}if(file.size>5*1024*1024){if(status)status.textContent='影像超過5 MB，請先縮小或裁剪。';return;}
  var requestCredential=key.value.trim();key.value='';if(button){button.disabled=true;button.textContent='OCR 處理中…';}if(status)status.textContent='影像正直接傳送至 MiniMax；請稍候。';var reader=new FileReader();
  function finish_(message,error){if(button){button.disabled=false;button.textContent='送 MiniMax OCR';}if(fileInput)fileInput.value='';var imageName=document.getElementById('leOcrImageName');if(imageName)imageName.textContent='未選擇影像';if(status)status.textContent=message;if(error)lifeEduToast_(message,true);}
  reader.onload=function(){
    var page=Number(pageInput&&pageInput.value),pageLabel=Number.isInteger(page)&&page>0?'第'+page+'頁':'目前影像';
    var prompt='請對附加的'+pageLabel+'感謝文章影像做繁體中文手寫 OCR。逐字照錄文章及可見的班別、班號、姓名、所屬小學和收件老師；不改錯字、不潤飾、不依名冊或頁序推斷。文章以外的電話、WhatsApp、聯絡資料一律不轉錄。看不清用〔疑字：候選1／候選2〕，不可辨用〔無法辨認〕；續頁無身份欄時標示未見。只輸出一個 JSON 物件，欄位為 page,class,classNumber,studentName,primarySchool,teacherName,ocrText,uncertainNotes。';
    var requestBody={model:LIFE_EDU_MINIMAX_MODEL,messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:String(reader.result||''),detail:'high'}}]}],reasoning_effort:'high',max_completion_tokens:2500};
    fetch(LIFE_EDU_MINIMAX_ENDPOINT,{method:'POST',mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',headers:{'Authorization':'Bearer '+requestCredential,'Content-Type':'application/json'},body:JSON.stringify(requestBody)}).then(function(response){return response.text().then(function(raw){var result;try{result=JSON.parse(raw);}catch(error){throw new Error('MiniMax 回應格式無法解析（HTTP '+response.status+'）。');}if(!response.ok){var detail=result.base_resp&&result.base_resp.status_msg||result.error&&result.error.message;throw new Error('MiniMax 回應 HTTP '+response.status+(detail?'：'+detail:'；請檢查 API key、配額及影像格式。'));}var content=result.choices&&result.choices[0]&&result.choices[0].message&&result.choices[0].message.content;if(Array.isArray(content))content=content.map(function(item){return item&&item.text||'';}).join('\n');if(!content)throw new Error('MiniMax 沒有回傳 OCR 文字。');return String(content).trim();});}).then(function(text){var paste=document.getElementById('leOcrPaste');if(paste)paste.value=text;finish_('已收到 MiniMax 輸出；請檢查 OCR 文字，再按「貼入所選學生」。API key 已清除。',false);}).catch(function(error){finish_(error.message||'MiniMax OCR 失敗；API key 已清除。',true);}).finally(function(){requestCredential='';requestBody=null;});
  };
  reader.onerror=function(){requestCredential='';finish_('無法讀取影像；API key 已清除。',true);};reader.readAsDataURL(file);
}
function lifeEduParseOcrPaste_(raw){
  var value=String(raw||'').trim();if(!value)throw new Error('請貼上 OCR 文字或 JSON。');var candidate=value.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  if(candidate.charAt(0)==='{'){try{return JSON.parse(candidate);}catch(e){throw new Error('OCR JSON 格式有誤；請修正 JSON，或只貼文章文字。');}}
  return {ocrText:value};
}
function lifeEduImportOcrPaste_(){
  var textarea=document.getElementById('leOcrPaste'),append=document.getElementById('leOcrAppend'),note=document.getElementById('leOcrNote'),source=document.getElementById('leSourceOcr'),verified=document.getElementById('leVerifiedOcr'),status=document.getElementById('leMiniMaxStatus');if(lifeEduAnyScanImportLocked_()){if(status)status.textContent='掃描匯入仍在進行；完成後再貼入 OCR。';return;}var row=lifeEduSelected_();if(!row){if(status)status.textContent='請先選擇學生。';return;}
  try{var parsed=lifeEduParseOcrPaste_(textarea&&textarea.value),rawNumber=String(parsed.classNumber==null?'':parsed.classNumber).trim(),hasNumber=rawNumber!=='',validNumber=lifeEduValidClassNumber_(rawNumber),rawClass=String(parsed.className||parsed.class||parsed.classLabel||'').trim(),ocrClass=lifeEduNormalizeClassName_(rawClass),studentClass=lifeEduNormalizeClassName_(row.className);if(rawClass&&!ocrClass)throw new Error('OCR 班別「'+rawClass+'」格式無法核實；請先修正或改用逐頁人工配對。');if(hasNumber&&!validNumber)throw new Error('OCR 班號「'+rawNumber+'」無效；須為 1 至 999 的整數。');if(validNumber&&Number(rawNumber)!==Number(row.classNumber))throw new Error('OCR 顯示班號 '+rawNumber+'，目前所選是第'+row.classNumber+'號。請切換到相符學生後再貼入。');if(ocrClass&&studentClass&&ocrClass!==studentClass)throw new Error('OCR 顯示班別 '+ocrClass+'，目前所選是 '+studentClass+' 班。請切換到相符學生後再貼入。');if(!rawClass||!hasNumber){if(!window.confirm('OCR 沒有完整班別及班號；請再確認目前選取的學生身份。仍要貼入？'))return;}
    var text=lifeEduStripOcrContact_(parsed.ocrText||parsed.text||'').trim();if(!text)throw new Error('JSON 中沒有文章 OCR 文字。');if(text.length>2800)throw new Error('OCR 文字超過2,800字，請分頁貼入。');
    var existingSource=source.value||'',existingVerified=verified.value||'';if(!append.checked&&(existingSource||existingVerified)&&!window.confirm('這位學生已有 OCR 文字；確定以新 OCR 覆蓋原始 OCR 與核對工作稿？'))return;
    var join=function(oldText,newText){return append.checked&&oldText?oldText+'\n\n〔續頁／OCR追加〕\n'+newText:newText;},nextSource=join(existingSource,text),nextVerified=join(existingVerified,text);if(nextVerified.length>2800)throw new Error('追加後「核對後 OCR」會超過2,800字；請分段處理，現有文字未被改動。');source.value=nextSource;verified.value=nextVerified;
    [['ocrStudentName',parsed.studentName],['ocrTeacherName',parsed.teacherName],['ocrPrimarySchool',parsed.primarySchool]].forEach(function(pair){var el=document.getElementById('le'+pair[0].charAt(0).toUpperCase()+pair[0].slice(1));if(el&&pair[1])el.value=String(pair[1]).slice(0,160);});
    var page=Number(parsed.page),messages=[];if(Number.isInteger(page)&&page>0){var scanned=document.getElementById('leScannedSheets');if(scanned)scanned.value=String((Number(scanned.value)||0)+1);messages.push('來源第'+page+'頁');}if(parsed.studentName)messages.push('姓名候選：'+parsed.studentName);if(parsed.teacherName)messages.push('老師候選：'+parsed.teacherName);if(parsed.uncertainNotes)messages.push('OCR疑點：'+parsed.uncertainNotes);if(parsed.classNumber&&!validNumber)messages.push('班號候選：'+rawNumber+'（未作自動配對）');if(note&&messages.length)note.value=(note.value?note.value+'；':'')+messages.join('；');
    var review=document.getElementById('leReviewStatus');if(review)review.value='待身份核對';lifeEduMarkDirty_();if(status)status.textContent='OCR 已放入目前學生的原始 OCR 及核對工作稿；請核實候選姓名後按「儲存此學生」。';
  }catch(error){if(status)status.textContent=error.message||String(error);}
}

function lifeEduHandleTemplateFile_(event){
  var file=event.target.files&&event.target.files[0];if(!file)return;var label=document.getElementById('leTemplateName');
  if(!/\.docx$/i.test(file.name)){lifeEduToast_('請選擇 .docx Word 範本。',true);event.target.value='';return;}
  file.arrayBuffer().then(function(buffer){return lifeEduSetTemplate_(buffer,file.name);}).catch(function(error){lifeEduToast_(error.message||'無法讀取 Word 範本。',true);});
}
function lifeEduSetTemplate_(buffer,name){
  if(typeof PizZip==='undefined'||typeof docxtemplater==='undefined'){throw new Error('Word 元件未載入，請檢查網絡後重新整理。');}
  var zip=new PizZip(new Uint8Array(buffer));var doc=new docxtemplater(zip,{paragraphLoop:true,linebreaks:true});
  var previous={bytes:LIFE_EDU_STATE.templateBytes,name:LIFE_EDU_STATE.templateName,tags:LIFE_EDU_STATE.lastTemplateTagNames?LIFE_EDU_STATE.lastTemplateTagNames.slice():[]};
  LIFE_EDU_STATE.templateBytes=buffer;LIFE_EDU_STATE.templateName=name||'Word 範本';LIFE_EDU_STATE.lastTemplateTagNames=[];
  var xml=zip.file('word/document.xml');if(xml){var matches=xml.asText().match(/\{[^{}]+\}/g)||[];LIFE_EDU_STATE.lastTemplateTagNames=matches.map(function(tag){return tag.slice(1,-1).trim();});}
  return lifeEduPersistLocal_().then(function(saved){if(!saved){LIFE_EDU_STATE.templateBytes=previous.bytes;LIFE_EDU_STATE.templateName=previous.name;LIFE_EDU_STATE.lastTemplateTagNames=previous.tags;var oldOutput=document.getElementById('leTemplateName');if(oldOutput)oldOutput.textContent=previous.name||'尚未載入範本';lifeEduRefreshPreviews_();throw new Error('本機記錄未能保存；原有 Word 範本已保留。');}
    var output=document.getElementById('leTemplateName');if(output)output.textContent=LIFE_EDU_STATE.templateName;
    var message=document.getElementById('leImportMessage');lifeEduSetImportMessage_(message,'已載入範本：'+LIFE_EDU_STATE.templateName+(LIFE_EDU_STATE.lastTemplateTagNames.length?'（讀到 '+LIFE_EDU_STATE.lastTemplateTagNames.length+' 個欄位標記）':'（尚未讀到 {欄位標記}）'),!LIFE_EDU_STATE.lastTemplateTagNames.length);
    lifeEduRefreshPreviews_();return doc;
  });
}
function lifeEduUseDefaultTemplate_(){
  try{var binary=atob(window.LIFE_EDU_DEFAULT_TEMPLATE_B64||'');if(!binary)throw new Error('預設範本未載入。');var bytes=new Uint8Array(binary.length);for(var i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);lifeEduSetTemplate_(bytes.buffer,'預設感恩卡範本.docx').then(function(){lifeEduToast_('已載入預設範本。');}).catch(function(error){lifeEduToast_(error.message||'未能載入預設範本。',true);});}catch(error){lifeEduToast_(error.message||'未能載入預設範本。',true);}
}
function lifeEduDownloadDefaultTemplate_(){
  try{var binary=atob(window.LIFE_EDU_DEFAULT_TEMPLATE_B64||'');if(!binary)throw new Error('預設範本未載入。');var bytes=new Uint8Array(binary.length);for(var i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);lifeEduDownload_(new Blob([bytes],{type:LIFE_EDU_WORD_MIME}),'謝師恩感恩卡_Word範本.docx');}catch(error){lifeEduToast_(error.message||'未能下載範本。',true);}
}
function lifeEduTemplateData_(row){
  var text=String(row&&row.correctedText||'').trim();if(!text)throw new Error('請先在第五步採納老師修訂稿，再預覽或匯出 Word 卡片。');
  return {activityTitle:(LIFE_EDU_STATE.meta||{}).title||'箋紙濃情謝師恩',year:'2026',className:row.className||'',classNumber:String(row.classNumber||''),studentName:row.nameZh||'',studentNameEn:row.nameEn||'',studentNumber:row.studentNumber||'',primarySchool:row.primarySchool||'',teacherName:row.teacherName||'',teacherTitle:row.teacherTitle||'',teacherDisplay:(row.teacherName||'')+(row.teacherTitle||''),correctedText:text,articleText:text,verifiedOcrText:text,sourceOcrText:text,fontSizePt:String(LIFE_EDU_STATE.fontSize)};
}
function lifeEduApplyWordFontSize_(zip,size){
  var file=zip.file('word/document.xml');if(!file)return;var parser=new DOMParser(),xml=parser.parseFromString(file.asText(),'application/xml');if(xml.getElementsByTagName('parsererror').length)throw new Error('範本 Word XML 無法解析。');
  var runs=xml.getElementsByTagNameNS(LIFE_EDU_WORD_NS,'r'),halfPt=String(Math.round(Number(size)*2));
  for(var i=0;i<runs.length;i++){var run=runs[i];if(!run.getElementsByTagNameNS(LIFE_EDU_WORD_NS,'t').length)continue;var props=run.getElementsByTagNameNS(LIFE_EDU_WORD_NS,'rPr')[0];if(!props){props=xml.createElementNS(LIFE_EDU_WORD_NS,'w:rPr');run.insertBefore(props,run.firstChild);}['sz','szCs'].forEach(function(local){var node=props.getElementsByTagNameNS(LIFE_EDU_WORD_NS,local)[0];if(!node){node=xml.createElementNS(LIFE_EDU_WORD_NS,'w:'+local);props.appendChild(node);}node.setAttributeNS(LIFE_EDU_WORD_NS,'w:val',halfPt);});}
  zip.file('word/document.xml',new XMLSerializer().serializeToString(xml));
}
function lifeEduGenerateWordBlob_(){
  if(!LIFE_EDU_STATE.templateBytes)throw new Error('請先載入或選擇 Word 範本。');if(typeof PizZip==='undefined'||typeof docxtemplater==='undefined')throw new Error('Word 元件未載入，請檢查網絡連線。');
  var zip=new PizZip(new Uint8Array(LIFE_EDU_STATE.templateBytes));var doc=new docxtemplater(zip,{paragraphLoop:true,linebreaks:true});doc.render(lifeEduTemplateData_(lifeEduSelected_()));var output=doc.getZip();lifeEduApplyWordFontSize_(output,LIFE_EDU_STATE.fontSize);return output.generate({type:'blob',mimeType:LIFE_EDU_WORD_MIME});
}
function lifeEduPreviewWord_(){
  var area=document.getElementById('leWordPreview');if(!area)return;var countError=lifeEduCountValidationError_(lifeEduCurrentForm_());if(countError){var saveMsg=document.getElementById('leSaveMsg');if(saveMsg){saveMsg.textContent=countError+' 更正後才可產生預覽。';saveMsg.classList.add('error');}lifeEduToast_(countError+' 更正後才可產生預覽。',true);return;}if(LIFE_EDU_STATE.dirty&&!lifeEduApplyFormToRow_())return;
  try{var blob=lifeEduGenerateWordBlob_();if(typeof mammoth==='undefined')throw new Error('Word 預覽元件未載入；可先匯出 DOCX，或檢查網絡後重新整理。');area.innerHTML='<div class="le-word-empty">正在整理 Word 預覽…</div>';
    blob.arrayBuffer().then(function(arrayBuffer){return mammoth.convertToHtml({arrayBuffer:arrayBuffer});}).then(function(result){var safe=lifeEduSanitizeHtml_(result.value);area.innerHTML='<article class="le-word-paper" style="--le-word-font:'+lifeEduFontCssPx_(LIFE_EDU_STATE.fontSize)+'">'+safe+'</article>';var notes=(result.messages||[]).filter(function(x){return x.type==='warning';});if(notes.length)lifeEduToast_('Word 預覽有格式提示；請以匯出檔在 Word 核實。');}).catch(function(error){area.innerHTML='<div class="le-word-empty">無法轉換預覽：'+lifeEduEsc_(error.message||String(error))+'</div>';});
  }catch(error){area.innerHTML='<div class="le-word-empty">'+lifeEduEsc_(error.message||String(error))+'</div>';}
}
function lifeEduSanitizeHtml_(html){
  var source=new DOMParser().parseFromString(String(html||''),'text/html'),allowed={P:1,H1:1,H2:1,H3:1,H4:1,BR:1,STRONG:1,B:1,EM:1,I:1,U:1,S:1,UL:1,OL:1,LI:1,TABLE:1,THEAD:1,TBODY:1,TR:1,TD:1,TH:1,BLOCKQUOTE:1};
  function copy(node){if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.nodeValue||'');if(node.nodeType!==Node.ELEMENT_NODE)return document.createDocumentFragment();var tag=node.tagName.toUpperCase();if(tag==='SCRIPT'||tag==='STYLE'||tag==='IFRAME'||tag==='OBJECT'||tag==='SVG')return document.createDocumentFragment();var frag=document.createDocumentFragment();Array.prototype.forEach.call(node.childNodes,function(child){frag.appendChild(copy(child));});if(!allowed[tag])return frag;var el=document.createElement(tag.toLowerCase());Array.prototype.forEach.call(frag.childNodes,function(child){el.appendChild(child);});if(tag==='TD'||tag==='TH'){['colspan','rowspan'].forEach(function(key){var v=Number(node.getAttribute(key));if(v>0&&v<30)el.setAttribute(key,String(v));});}return el;}
  var out=document.createDocumentFragment();Array.prototype.forEach.call(source.body.childNodes,function(n){out.appendChild(copy(n));});var container=document.createElement('div');container.appendChild(out);return container.innerHTML;
}
function lifeEduExportWord_(){
  if(LIFE_EDU_STATE.dirty){lifeEduToast_('目前學生有未儲存更改，請先儲存再匯出。',true);return;}
  try{var blob=lifeEduGenerateWordBlob_(),row=lifeEduSelected_(),name=(row.nameZh||'學生')+'_謝師恩感恩卡.docx';lifeEduDownload_(blob,name);lifeEduToast_('已匯出 '+name+'；請以 Word 開啟檢查實際分頁。');}catch(error){lifeEduToast_(error.message||'Word 匯出失敗。',true);}
}

window.LIFE_EDU_DRIVE_BRIDGE={
  createBackupZip:lifeEduCreateBackupZip_,
  restoreBackupZip:lifeEduRestoreBackupZipFile_,
  getRestoreBlockReason:function(){return lifeEduDriveRestoreBlockReason_(false);}
};

lifeEduStart_();
