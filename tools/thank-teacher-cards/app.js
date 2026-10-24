
/* 獨立謝師恩文章工具：名單、批改、Word 範本及預覽。 */
var LIFE_EDU_STATE = {
  loaded:false, rows:[], savedRows:[], meta:{title:'箋紙濃情謝師恩 2026'}, selectedId:'',
  filter:'all', search:'', dirty:false, templateBytes:null, templateName:'',
  fontSize:16, importing:false, generating:false
};
var LIFE_EDU_REVIEW_STATUSES = ['待收稿','待身份核對','待學生澄清','待老師覆核','已完成','豁免'];
var LIFE_EDU_WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
var LIFE_EDU_WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
var LIFE_EDU_LOCAL_KEY = 'local-tools.thank-teacher-cards.v1';
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
function lifeEduPill_(status){return status==='已收齊'||status==='已完成'||status==='免交'?'ok':(status.indexOf('欠')===0||status==='待學生澄清'||status==='待核張數'?'warn':'');}
function lifeEduSelected_(){return LIFE_EDU_STATE.rows.filter(function(r){return r.id===LIFE_EDU_STATE.selectedId;})[0]||LIFE_EDU_STATE.rows[0]||null;}
function lifeEduSourceUrl_(url){return /^https:\/\//i.test(String(url||''))?String(url):'';}

function lifeEduStart_(){
  try{
    var saved=JSON.parse(localStorage.getItem(LIFE_EDU_LOCAL_KEY)||'null');
    if(saved&&saved.format==='life-edu-local-backup'&&saved.schemaVersion===1){
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
  return {format:'life-edu-local-backup',schemaVersion:1,createdAt:new Date().toISOString(),rows:LIFE_EDU_STATE.rows,meta:LIFE_EDU_STATE.meta||{},fontSize:LIFE_EDU_STATE.fontSize,templateName:LIFE_EDU_STATE.templateName||'',templateBase64:templateBase64};
}
function lifeEduValidateBackup_(backup){
  if(!backup||backup.format!=='life-edu-local-backup'||backup.schemaVersion!==1||!Array.isArray(backup.rows))throw new Error('這不是可還原的謝師恩 JSON 備份。');
  if(backup.rows.length>1000||backup.rows.some(function(row){return !row||typeof row!=='object'||Array.isArray(row);}))throw new Error('備份記錄數量或資料結構不正確。');
  var identities=Object.create(null);
  return backup.rows.map(function(raw){
    var row=lifeEduNormalizeImportRow_(raw),className=typeof row.className==='string'?row.className.trim():'';
    var rawNumber=row.classNumber,numberText=typeof rawNumber==='number'&&Number.isInteger(rawNumber)?String(rawNumber):typeof rawNumber==='string'?rawNumber.trim():'';
    if(!className||className.length>50||/[\u0000-\u001f\u007f]/.test(className)||!/^\d{1,3}$/.test(numberText)||Number(numberText)<1||Number(numberText)>999)throw new Error('備份內每名學生必須有有效班別和 1 至 999 的整數班號。');
    row.className=className;row.classNumber=Number(numberText);row.id=className+'-'+('0'+row.classNumber).slice(-2);
    if(identities[row.id])throw new Error('備份內有重複的班別和班號：'+row.id+'。');identities[row.id]=true;
    var textFields=['studentNumber','nameZh','nameEn','gender','house','primarySchool','ocrStudentName','ocrTeacherName','ocrPrimarySchool','teacherName','teacherTitle','teacherNote','ocrNote','sourceUrl','sourceOcrText','verifiedOcrText','correctedText','updatedAt','updatedBy'];
    textFields.forEach(function(key){var value=row[key];if(value==null){row[key]='';return;}if(typeof value!=='string'&&typeof value!=='number'&&typeof value!=='boolean')throw new Error('備份內 '+key+' 必須是文字。');row[key]=String(value);if(row[key].length>(key==='sourceOcrText'||key==='verifiedOcrText'||key==='correctedText'?20000:2000))throw new Error('備份內 '+key+' 超出可接受長度。');});
    ['expectedSheets','physicalReceived','scannedSheets'].forEach(function(key){var value=row[key];if(value==null||value===''){row[key]='';return;}var rawValue=String(value).trim();if(!/^\d{1,2}$/.test(rawValue)||Number(rawValue)>20)throw new Error('備份內 '+key+' 必須是 0 至 20 的整數或留空。');row[key]=rawValue;});
    if(LIFE_EDU_REVIEW_STATUSES.indexOf(row.reviewStatus)<0)row.reviewStatus='待身份核對';
    return row;
  });
}
function lifeEduApplyBackup_(backup){
  LIFE_EDU_STATE.rows=lifeEduValidateBackup_(backup);
  LIFE_EDU_STATE.meta=backup.meta&&typeof backup.meta==='object'?lifeEduClone_(backup.meta):{title:'箋紙濃情謝師恩 2026'};
  if(!Array.isArray(LIFE_EDU_STATE.meta.classTeachers))LIFE_EDU_STATE.meta.classTeachers=[];
  if(typeof LIFE_EDU_STATE.meta.title!=='string')LIFE_EDU_STATE.meta.title='箋紙濃情謝師恩 2026';
  LIFE_EDU_STATE.fontSize=Math.min(28,Math.max(12,Number(backup.fontSize)||16));
  LIFE_EDU_STATE.templateBytes=null;LIFE_EDU_STATE.templateName=String(backup.templateName||'');
  if(backup.templateBase64){var binary=atob(backup.templateBase64),bytes=new Uint8Array(binary.length);for(var i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);LIFE_EDU_STATE.templateBytes=bytes.buffer;}
}
function lifeEduPersistLocal_(){try{localStorage.setItem(LIFE_EDU_LOCAL_KEY,JSON.stringify(lifeEduLocalBackup_()));var label=document.getElementById('leLocalSaveStatus');if(label)label.textContent='本機已保存 '+new Date().toLocaleTimeString('zh-HK',{hour:'2-digit',minute:'2-digit'});return true;}catch(error){lifeEduToast_('本機保存失敗；儲存空間可能已滿。請先下載 JSON 備份。',true);return false;}}

function lifeEduRender_(){
  var rows=LIFE_EDU_STATE.rows,selected=lifeEduSelected_();
  var classes=[];rows.forEach(function(row){var name=String(row.className||'').trim();if(name&&classes.indexOf(name)<0)classes.push(name);});
  var rosterTitle=classes.length?classes.map(lifeEduEsc_).join('、')+' 名冊':'學生名冊';
  var required=rows.filter(function(r){return !r.exempt&&Number(r.expectedSheets)>0;});
  var expected=rows.reduce(function(n,r){return n+(Number(r.expectedSheets)||0);},0);
  var counted=required.filter(function(r){return r.physicalReceived!==''&&r.physicalReceived!=null;});
  var received=counted.reduce(function(n,r){return n+(Number(r.physicalReceived)||0);},0);
  var gap=counted.reduce(function(n,r){return n+Math.max(0,Number(r.expectedSheets||0)-Number(r.physicalReceived||0));},0);
  var scanned=rows.reduce(function(n,r){return n+(Number(r.scannedSheets)||0);},0);
  var classTeachers=((LIFE_EDU_STATE.meta||{}).classTeachers||[]).join('、');
  document.getElementById('leApp').innerHTML=
    '<section class="le-intro"><div><div class="le-eyebrow">公開瀏覽器工具・資料保存在此瀏覽器</div><h2>文章核對、收稿追蹤及感恩卡製作</h2><p>目前名冊 '+rows.length+' 人；已核實應交 '+expected+' 張。掃描頁數與紙本收件數分開記錄。 <span id="leLocalSaveStatus" class="le-local-save-status">本機記錄已載入</span></p></div>'+
    '<div class="le-actions"><button class="le-button le-button-quiet" type="button" data-le-export="csv">匯出 CSV</button><button class="le-button le-button-quiet" type="button" data-le-export="json">下載 JSON 備份</button><button class="le-button" type="button" data-le-export-word>匯出此生 Word 卡片</button></div></section>'+
    '<div class="le-notice"><b>張數規則：</b>名冊「2」欄剔號＝應交2張；其他剔號＝1張；「1」下方圈號＝免交。預計應收 '+expected+' 張。紙本已收欄留空代表尚待點收，不能用已提供的掃描頁數代替。'+
      '<div class="le-source-line">班主任名冊 OCR：'+lifeEduEsc_(classTeachers||'待核')+'。所屬小學及正式學號不在目前來源內，待匯入正式資料。</div></div>'+
    '<section class="le-stats"><div class="le-stat"><b>'+rows.length+'</b><span>名冊學生</span></div><div class="le-stat"><b>'+expected+'</b><span>應交文章張數</span></div><div class="le-stat"><b>'+received+' / '+counted.length+'</b><span>已點收張數／人數</span></div><div class="le-stat"><b>'+scanned+'</b><span>目前掃描頁數</span></div><div class="le-stat"><b>'+gap+'</b><span>已核實欠交張數</span></div></section>'+
    '<details class="le-panel le-import-panel" id="leImportPanel"><summary>匯入內容清單、名單／文章資料及 Word 範本</summary><div class="le-import-content">'+
      '<div class="le-import-grid"><article class="le-import-card"><h3>① 學生名單 CSV／JSON</h3><p>每名學生一列，按「班別＋班號」配對現有記錄。可匯入英文／中文姓名、正式學號、所屬小學、性別、社別、應交張數及紙本已收張數。</p><ul><li>CSV 標題：班別、班號、正式學號、中文姓名OCR、英文姓名、所屬小學、性別、社別、應交張數、紙本已收張數、掃描頁數</li><li>匯入採合併更新，未列出的學生保留。</li></ul></article>'+
      '<article class="le-import-card"><h3>② 文章 OCR／批改資料 JSON</h3><p>可匯入逐頁 OCR JSON，按班別及班號合併；也可匯入本工具的完整 JSON 備份，還原全部記錄、範本和字體設定。</p><ul><li><code>sourceOcrText, verifiedOcrText, correctedText</code></li><li><code>ocrStudentName, ocrTeacherName, ocrPrimarySchool</code> 只存 OCR 候選，不覆蓋正式欄位</li><li>完整備份匯入會取代目前所有資料，並先要求確認</li></ul></article>'+
      '<article class="le-import-card"><h3>③ 感恩卡 Word 範本 DOCX</h3><p>在 Word 範本放入欄位標記。此工具會代入所選學生資料，並依字體大小設定產生 DOCX。</p><ul><li><code>{teacherDisplay}</code>、<code>{correctedText}</code></li><li><code>{studentName}</code>、<code>{studentNameEn}</code></li><li><code>{className}</code>、<code>{classNumber}</code></li><li><code>{studentNumber}</code>、<code>{primarySchool}</code>、<code>{activityTitle}</code></li></ul></article></div>'+
      '<section class="le-ocr-import"><h3>④ OCR 影像與貼上結果</h3><p>可貼上 Gemini、MiniMax 或其他 OCR 的文字／JSON；也可輸入自己的 MiniMax API key，在本頁直接進行單頁影像 OCR。OCR 結果先保留在原始 OCR 和核對後 OCR，老師修訂稿不會被改寫。</p><div class="le-ocr-controls"><label class="le-field le-ocr-key">MiniMax API key（只在本次要求使用）<input id="leMiniMaxKey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="貼上 key；不會保存"></label><label class="le-field le-ocr-page">掃描頁碼（可留空）<input id="leOcrPageNumber" type="number" min="1" max="1000" step="1" placeholder="例如 1"></label><label class="le-button le-button-quiet le-button-small" for="leOcrImage">選擇單頁影像</label><input class="le-hidden" id="leOcrImage" type="file" accept="image/jpeg,image/png,image/webp"><span id="leOcrImageName" class="le-file-name">未選擇影像</span><button class="le-button le-button-small" type="button" data-le-minimax-ocr>送 MiniMax OCR</button><span id="leMiniMaxStatus" class="le-import-message" role="status"></span></div><p class="le-ocr-privacy">按下 OCR 後，所選影像和 API key 會由瀏覽器直接傳送到 MiniMax API；不會先經過 Local-tools 伺服器，也不會儲存在本工具。每次最多一張 5 MB 影像。請先確認校方資料處理要求，並避免傳送不需辨認的聯絡資料。</p><label class="le-field le-ocr-paste-label" for="leOcrPaste">貼上 Gemini／MiniMax OCR 結果</label><textarea id="leOcrPaste" class="le-textarea le-ocr-paste" spellcheck="false" placeholder="可貼純文章文字或單頁 JSON，例如 {&quot;page&quot;:1,&quot;class&quot;:&quot;例如 1A&quot;,&quot;classNumber&quot;:4,&quot;studentName&quot;:&quot;…&quot;,&quot;teacherName&quot;:&quot;…&quot;,&quot;ocrText&quot;:&quot;…&quot;}"></textarea><div class="le-ocr-paste-actions"><label class="le-review-check"><input id="leOcrAppend" type="checkbox">追加至所選學生原文（續頁使用）</label><button class="le-button le-button-quiet le-button-small" type="button" data-le-import-ocr>貼入所選學生</button><span class="le-muted">貼入後請檢查候選姓名／班號，再按「儲存此學生」。</span></div></section>'+
      '<div class="le-import-controls"><label class="le-button le-button-quiet le-button-small" for="leDataFile">匯入名單／文章 CSV、JSON 備份</label><input class="le-hidden" id="leDataFile" type="file" accept=".csv,.json,.txt,application/json,text/csv"><span id="leDataName" class="le-file-name">未選擇資料檔</span><button class="le-button le-button-quiet le-button-small" type="button" data-le-download-csv-template>下載 CSV 欄位範本</button><button class="le-button le-button-quiet le-button-small" type="button" data-le-use-default-template>載入預設卡片範本</button><label class="le-button le-button-quiet le-button-small" for="leTemplateFile">選擇 Word 範本 DOCX</label><input class="le-hidden" id="leTemplateFile" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"><span id="leTemplateName" class="le-file-name">'+lifeEduEsc_(LIFE_EDU_STATE.templateName||'尚未載入範本')+'</span><button class="le-button le-button-quiet le-button-small" type="button" data-le-download-template>下載預設範本</button><span id="leImportMessage" class="le-import-message" role="status"></span></div>'+
      '<div class="le-library-warning" id="leLibraryWarning"></div></div></details>'+
    '<div class="le-main-grid"><aside class="le-panel le-roster"><div class="le-roster-head"><h3>'+rosterTitle+'</h3><span>'+rows.length+' 人</span></div><div class="le-roster-tools"><input id="leSearch" type="search" placeholder="搜尋姓名、英文名或班號" value="'+lifeEduEsc_(LIFE_EDU_STATE.search)+'"><select id="leFilter"><option value="all">全部狀態</option><option value="待點收">待點收</option><option value="待核張數">待核張數</option><option value="欠交">已核實欠交</option><option value="已收齊">已收齊</option><option value="免交">免交</option><option value="待改文">文章待處理</option></select></div><div id="leRosterList" class="le-roster-list">'+rows.map(lifeEduRosterButton_).join('')+'</div></aside>'+
    '<div class="le-work"><section class="le-panel le-editor">'+(selected?lifeEduEditor_(selected):'<p class="le-muted">名冊沒有資料。</p>')+'</section>'+lifeEduPreviewPanel_()+'</div></div>'+
    '<section class="le-panel le-workflow"><h3>建議工作流程</h3><ol><li><b>匯入正式資料：</b>以班別、班號配對；補入正式學號及所屬小學。</li><li><b>逐份點收：</b>按應交張數記紙本已收數；「掃描頁」另行記錄。</li><li><b>核對姓名與 OCR：</b>先確認姓名、老師姓名和低信心字，再修正 OCR。</li><li><b>老師批改：</b>檢查錯字、文句通順和格式；保留學生原意，不清楚處請學生確認。</li><li><b>預覽及匯出：</b>調字體、檢查卡面及 Word 預覽，再匯出目前學生的 Word 卡片。</li></ol><div class="le-workflow-note">建議在匯入或批改前下載 JSON 備份。匯入本工具完整 JSON 備份會取代本機記錄；匯入名單或 OCR JSON 則按班別及班號合併。班號用來配對本次班別資料，不代替正式學籍號碼。</div></section>';
  var filter=document.getElementById('leFilter');if(filter)filter.value=LIFE_EDU_STATE.filter;
  lifeEduBind_();lifeEduApplyFilter_();lifeEduRefreshPreviews_();
}

function lifeEduRosterButton_(row){
  var status=lifeEduStatus_(row), pending=!row.exempt&&row.reviewStatus!=='已完成';
  var filterStatus=status==='免交'?'免交':status==='待點收'?'待點收':status==='待核張數'?'待核張數':status.indexOf('欠')===0?'欠交':'已收齊';
  var find=[row.classNumber,row.nameZh,row.nameEn].join(' ').toLowerCase();
  return '<button type="button" class="le-student'+(row.id===LIFE_EDU_STATE.selectedId?' on':'')+'" data-le-select="'+lifeEduEsc_(row.id)+'" data-le-status="'+filterStatus+'" data-le-pending="'+(pending?'1':'0')+'" data-le-search="'+lifeEduEsc_(find)+'"><span class="le-student-no">'+lifeEduEsc_(row.classNumber)+'</span><span class="le-student-main"><b>'+lifeEduEsc_(row.nameZh||'待辨讀')+'</b><small>'+lifeEduEsc_(row.nameEn||'')+'</small><small>應交 '+(row.exempt?'免交':row.expectedSheets===''||row.expectedSheets==null?'待核張數':Number(row.expectedSheets)+'張')+' · 紙本 '+(row.physicalReceived===''||row.physicalReceived==null?'待點收':Number(row.physicalReceived)+'張')+'</small></span><span class="le-pill '+lifeEduPill_(status)+'">'+lifeEduEsc_(status)+'</span></button>';
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
    '<div class="le-section-head"><h4>老師修訂稿</h4><span>供卡片預覽及 Word 匯出</span></div><textarea class="le-textarea le-textarea-draft" id="leCorrectedText" maxlength="2800" placeholder="修正錯字、文句及格式；不清楚處保留待學生確認">'+lifeEduEsc_(row.correctedText||'')+'</textarea>'+
    '<div class="le-review-row"><label class="le-field">老師核對狀態<select id="leReviewStatus">'+statuses+'</select></label><fieldset><legend>批改項目</legend>'+lifeEduCheck_('錯字已核對','checkSpelling',row.checkSpelling)+lifeEduCheck_('文句已核對','checkFlow',row.checkFlow)+lifeEduCheck_('格式已核對','checkFormat',row.checkFormat)+lifeEduCheck_('待學生澄清','studentFollowup',row.studentFollowup)+'</fieldset></div>'+
    '<div class="le-editor-grid"><label class="le-field le-field-wide">OCR／姓名核對記錄<textarea class="le-textarea" id="leOcrNote" maxlength="500">'+lifeEduEsc_(row.ocrNote||'')+'</textarea></label><label class="le-field le-field-wide">老師批改備註<textarea class="le-textarea" id="leTeacherNote" maxlength="900">'+lifeEduEsc_(row.teacherNote||'')+'</textarea></label></div>'+
    '<div class="le-editor-bottom"><div class="le-editor-meta">'+(source?'<a class="le-link" target="_blank" rel="noopener" href="'+lifeEduEsc_(source)+'">開啟文章來源掃描</a>':'<span>未提供文章掃描連結</span>')+'<span>班主任名冊 OCR：'+lifeEduEsc_(((LIFE_EDU_STATE.meta||{}).classTeachers||[]).join('、'))+'</span><span>'+(row.updatedAt?'最後更新 '+lifeEduEsc_(row.updatedAt):'尚未修改')+'</span></div><div><span id="leSaveMsg" class="le-save-msg" role="status"></span><button type="button" class="le-button" data-le-save>儲存此學生</button></div></div>';
}
function lifeEduInput_(label,key,value,placeholder,type,min,max,extraClass){
  var id='le'+key.charAt(0).toUpperCase()+key.slice(1),safe=lifeEduEsc_(value==null?'':value);
  var attrs=type==='number'?' type="number" min="'+min+'" max="'+max+'" step="1"':type==='url'?' type="url"':' type="text"';
  var el=type==='select'?'<select id="'+id+'">'+placeholder+'</select>':'<input id="'+id+'"'+attrs+' value="'+safe+'" placeholder="'+lifeEduEsc_(placeholder||'')+'">';
  return '<label class="le-field '+(extraClass||'')+'"><span>'+lifeEduEsc_(label)+'</span>'+el+'</label>';
}
function lifeEduCheck_(label,key,checked){return '<label class="le-review-check"><input id="le'+key.charAt(0).toUpperCase()+key.slice(1)+'" type="checkbox"'+(checked?' checked':'')+'>'+lifeEduEsc_(label)+'</label>';}

function lifeEduPreviewPanel_(){
  return '<section class="le-panel le-preview-panel"><div class="le-preview-head"><div><h3>版面預覽</h3><p>卡面即時預覽；Word 預覽按目前範本、文字和字體設定重新生成。</p></div><label class="le-font-control" for="leFontSize">字體大小 <input id="leFontSize" type="range" min="12" max="28" step="1" value="'+LIFE_EDU_STATE.fontSize+'"><b><span id="leFontSizeLabel">'+LIFE_EDU_STATE.fontSize+'</span> pt</b></label></div><div class="le-preview-grid">'+
    '<div class="le-preview-box"><div class="le-preview-box-head"><b>感恩卡效果</b><span>紙張比例預覽</span></div><div class="le-card-stage"><article class="le-card-preview" id="leCardPreview"></article></div></div>'+
    '<div class="le-preview-box"><div class="le-preview-box-head"><b>匯出 Word 預覽</b><button type="button" class="le-button le-button-small" data-le-preview-word>產生／更新預覽</button></div><div id="leWordPreview" class="le-word-preview"><div class="le-word-empty">選擇或載入 Word 範本後，按「產生／更新預覽」。<br>Word 內容只在此瀏覽器轉換顯示。</div></div></div></div><p class="le-word-footnote">Word 預覽會保留主要文字與段落格式；Word 的實際分頁、紙張邊界及字體代換，請以下載檔在 Word 開啟後為準。</p></section>';
}

function lifeEduBind_(){
  document.querySelectorAll('[data-le-select]').forEach(function(button){button.addEventListener('click',function(){
    if(LIFE_EDU_STATE.dirty&&!window.confirm('目前學生有未儲存更改。放棄這些更改並切換？'))return;
    LIFE_EDU_STATE.selectedId=button.dataset.leSelect;LIFE_EDU_STATE.dirty=false;
    if(LIFE_EDU_STATE.savedRows.length)LIFE_EDU_STATE.rows=lifeEduClone_(LIFE_EDU_STATE.savedRows);lifeEduPersistLocal_();
    lifeEduRender_();
  });});
  var search=document.getElementById('leSearch');if(search)search.addEventListener('input',function(){LIFE_EDU_STATE.search=search.value;lifeEduApplyFilter_();});
  var filter=document.getElementById('leFilter');if(filter)filter.addEventListener('change',function(){LIFE_EDU_STATE.filter=filter.value;lifeEduApplyFilter_();});
  document.querySelectorAll('.le-editor input,.le-editor textarea,.le-editor select').forEach(function(el){el.addEventListener('input',lifeEduMarkDirty_);el.addEventListener('change',lifeEduMarkDirty_);});
  var save=document.querySelector('[data-le-save]');if(save)save.addEventListener('click',lifeEduSaveCurrent_);
  var font=document.getElementById('leFontSize');if(font)font.addEventListener('input',function(){LIFE_EDU_STATE.fontSize=Number(font.value)||16;document.getElementById('leFontSizeLabel').textContent=LIFE_EDU_STATE.fontSize;lifeEduRefreshPreviews_();lifeEduPersistLocal_();});
  var dataFile=document.getElementById('leDataFile');if(dataFile)dataFile.addEventListener('change',lifeEduHandleDataFile_);
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
  var missing=[];if(typeof PizZip==='undefined')missing.push('Word ZIP');if(typeof docxtemplater==='undefined')missing.push('Word 模板處理');if(typeof mammoth==='undefined')missing.push('Word 預覽');
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
  var data=lifeEduCurrentForm_();LIFE_EDU_STATE.rows=LIFE_EDU_STATE.rows.map(function(row){return row.id===data.id?Object.assign({},row,data):row;});return data;
}
function lifeEduMarkDirty_(){
  LIFE_EDU_STATE.dirty=true;var dirty=document.getElementById('leDirty');if(dirty){dirty.textContent='有未儲存更改';dirty.classList.add('le-unsaved');}
  lifeEduApplyFormToRow_();lifeEduRefreshPreviews_();lifeEduPersistLocal_();
}
function lifeEduRefreshPreviews_(){
  var row=lifeEduSelected_();if(!row)return;
  var card=document.getElementById('leCardPreview');if(card){var teacher=(row.teacherName||'〔收件老師待核〕')+(row.teacherTitle||'');var body=row.correctedText||row.verifiedOcrText||'';var uncertain=/〔|待核|待確認|待學生/i.test(body);
    card.style.setProperty('--le-card-font',lifeEduFontCssPx_(LIFE_EDU_STATE.fontSize));
  card.innerHTML='<div><p class="le-card-title">'+lifeEduEsc_((LIFE_EDU_STATE.meta||{}).title||'箋紙濃情謝師恩')+'</p><p class="le-card-greeting">敬愛的'+lifeEduEsc_(teacher)+'：</p><div class="le-card-body'+(!body?' le-card-empty':'')+'">'+lifeEduEsc_(body||'請在老師修訂稿填入感恩文章。')+'</div>'+(uncertain?'<p class="le-source-line">含待核字句；定稿前請確認</p>':'')+'</div><div class="le-card-footer">'+lifeEduEsc_(row.nameZh||'〔學生姓名〕')+'<br>'+lifeEduEsc_(row.className||'〔班別〕')+' 第 '+lifeEduEsc_(row.classNumber)+' 號</div>';
  }
  var paper=document.querySelector('.le-word-paper');if(paper)paper.style.setProperty('--le-word-font',lifeEduFontCssPx_(LIFE_EDU_STATE.fontSize));
}
function lifeEduFontCssPx_(points){return (Number(points||16)*4/3).toFixed(2)+'px';}

function lifeEduSaveCurrent_(){
  var payload=lifeEduCurrentForm_(),msg=document.getElementById('leSaveMsg');
  if((payload.expectedSheets!==''&&!/^\d+$/.test(String(payload.expectedSheets)))||(payload.scannedSheets!==''&&!/^\d+$/.test(String(payload.scannedSheets)))){if(msg){msg.textContent='應交張數及掃描頁數須為非負整數，尚未核實的欄位可留空。';msg.classList.add('error');}return;}
  var button=document.querySelector('[data-le-save]');if(button){button.disabled=true;button.textContent='儲存中…';}
  try{payload.updatedAt=new Date().toISOString();payload.updatedBy='本機';LIFE_EDU_STATE.rows=LIFE_EDU_STATE.rows.map(function(r){return r.id===payload.id?Object.assign({},r,payload):r;});if(!lifeEduPersistLocal_())throw new Error('本機保存失敗。');LIFE_EDU_STATE.savedRows=lifeEduClone_(LIFE_EDU_STATE.rows);LIFE_EDU_STATE.dirty=false;if(button){button.disabled=false;button.textContent='儲存此學生';}lifeEduRender_();lifeEduToast_('已保存到本機瀏覽器。');}
  catch(error){if(button){button.disabled=false;button.textContent='儲存此學生';}if(msg){msg.textContent=error.message||'本機保存失敗。';msg.classList.add('error');}}
}

function lifeEduExportData_(kind){
  if(LIFE_EDU_STATE.dirty){lifeEduToast_('目前學生有未儲存更改，請先儲存再匯出。',true);return;}
  var rows=LIFE_EDU_STATE.rows||[],meta=LIFE_EDU_STATE.meta||{};
  if(kind==='json'){lifeEduDownload_(new Blob([JSON.stringify(lifeEduLocalBackup_(),null,2)],{type:'application/json;charset=utf-8'}),'謝師恩本機備份.json');return;}
  var headers=['班別','班號','正式學號','中文姓名OCR','英文姓名','性別','社別','所屬小學','OCR姓名候選','OCR老師候選','OCR小學候選','收件老師','老師職銜','應交張數','紙本已收張數','掃描頁數','收稿狀態','文章狀態','原始OCR','核對後OCR','老師修訂稿','錯字已核對','文句已核對','格式已核對','待學生澄清','OCR疑點','批改備註','原稿連結','最後更新','更新者'];
  var keys=['className','classNumber','studentNumber','nameZh','nameEn','gender','house','primarySchool','ocrStudentName','ocrTeacherName','ocrPrimarySchool','teacherName','teacherTitle','expectedSheets','physicalReceived','scannedSheets','_receipt','reviewStatus','sourceOcrText','verifiedOcrText','correctedText','checkSpelling','checkFlow','checkFormat','studentFollowup','ocrNote','teacherNote','sourceUrl','updatedAt','updatedBy'];
  var lines=[headers.map(lifeEduCsvCell_).join(',')];rows.forEach(function(row){lines.push(keys.map(function(key){var v=key==='_receipt'?lifeEduStatus_(row):row[key];return lifeEduCsvCell_(v);}).join(','));});
  lifeEduDownload_(new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),'謝師恩文章核對資料.csv');
}
function lifeEduCsvCell_(value){var s=String(value==null?'':value);if(/^\s*[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
function lifeEduDownloadCsvTemplate_(){
  var headers=['班別','班號','正式學號','中文姓名OCR','英文姓名','性別','社別','所屬小學','OCR姓名候選','OCR老師候選','OCR小學候選','收件老師','老師職銜','應交張數','紙本已收張數','掃描頁數','文章狀態','原始OCR','核對後OCR','老師修訂稿','錯字已核對','文句已核對','格式已核對','待學生澄清','OCR疑點','批改備註','原稿連結'];
  lifeEduDownload_(new Blob(['\ufeff'+headers.map(lifeEduCsvCell_).join(',')+'\r\n'],{type:'text/csv;charset=utf-8'}),'謝師恩名單及文章匯入欄位.csv');
}
function lifeEduDownload_(blob,name){var url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();window.setTimeout(function(){URL.revokeObjectURL(url);},1500);}

function lifeEduHandleDataFile_(event){
  var file=event.target.files&&event.target.files[0];if(!file)return;var label=document.getElementById('leDataName'),message=document.getElementById('leImportMessage');if(label)label.textContent=file.name;if(message){message.className='le-import-message';message.textContent='讀取中…';}
  if(file.size>20*1024*1024){lifeEduSetImportMessage_(message,'資料檔超過 20 MB，請先分批匯入。',true);event.target.value='';return;}
  if(LIFE_EDU_STATE.dirty){if(!window.confirm('目前學生有未儲存更改。匯入前會先保存目前編輯，是否繼續？')){event.target.value='';if(message)message.textContent='已取消匯入。';return;}lifeEduApplyFormToRow_();if(!lifeEduPersistLocal_()){event.target.value='';lifeEduSetImportMessage_(message,'本機記錄未能保存，已停止匯入。',true);return;}LIFE_EDU_STATE.savedRows=lifeEduClone_(LIFE_EDU_STATE.rows);LIFE_EDU_STATE.dirty=false;}
  var reader=new FileReader();reader.onload=function(){try{var imported=/\.csv$|\.txt$/i.test(file.name)?lifeEduParseCsv_(String(reader.result||'')):JSON.parse(String(reader.result||''));if(imported&&imported.format==='life-edu-local-backup'){lifeEduRestoreBackup_(imported,message);return;}var rawRows=Array.isArray(imported)?imported:(imported.rows||imported.records||imported.students||(imported.article?[imported.article]:[]));if(imported&&Array.isArray(imported.pages))rawRows=imported.pages;if(rawRows.length&&rawRows[0]&&rawRows[0].page!==undefined&&rawRows[0].ocrText!==undefined){var grouped=lifeEduGroupOcrPageRows_(rawRows);if(!grouped.rows.length){var reasons=[];if(grouped.unresolved)reasons.push(grouped.unresolved+'頁缺少可用班別／班號');if(grouped.conflicted)reasons.push(grouped.conflicted+'頁的候選身份不一致');if(grouped.oversized)reasons.push(grouped.oversized+'頁因合併後超過2,800字而未匯入');throw new Error('OCR JSON 沒有可安全批次匯入的頁面（'+reasons.join('；')+'）；請逐頁核實身份後貼入。');}lifeEduImportRows_(grouped.rows,message,grouped);return;}var rows=rawRows.map(lifeEduNormalizeImportRow_);if(!rows.length)throw new Error('未找到學生記錄。請使用 CSV 或 JSON 資料。');lifeEduImportRows_(rows,message);}catch(error){lifeEduSetImportMessage_(message,error.message||String(error),true);}finally{event.target.value='';}};reader.onerror=function(){lifeEduSetImportMessage_(message,'無法讀取檔案。',true);event.target.value='';};reader.readAsText(file,'UTF-8');
}
function lifeEduRestoreBackup_(backup,messageNode){
  try{
    lifeEduValidateBackup_(backup);
    if(!window.confirm('這是完整本機備份。還原會取代目前瀏覽器內全部學生記錄、設定和範本；建議先下載現有 JSON 備份。確定還原？')){lifeEduSetImportMessage_(messageNode,'已取消還原；現有記錄保留。',false);return;}
    var previous=lifeEduLocalBackup_();lifeEduApplyBackup_(backup);LIFE_EDU_STATE.selectedId=LIFE_EDU_STATE.rows[0]&&LIFE_EDU_STATE.rows[0].id||'';LIFE_EDU_STATE.dirty=false;
    if(!lifeEduPersistLocal_()){lifeEduApplyBackup_(previous);throw new Error('本機儲存空間不足，已保留還原前記錄。');}
    LIFE_EDU_STATE.savedRows=lifeEduClone_(LIFE_EDU_STATE.rows);lifeEduRender_();var currentMessage=document.getElementById('leImportMessage');lifeEduSetImportMessage_(currentMessage,'完整 JSON 備份已還原。',false);var importPanel=document.getElementById('leImportPanel');if(importPanel)importPanel.open=true;lifeEduToast_('完整 JSON 備份已還原。');
  }catch(error){lifeEduSetImportMessage_(messageNode,error.message||'備份還原失敗。',true);}
}
function lifeEduSetImportMessage_(node,message,error){if(!node)return;node.textContent=message;node.className='le-import-message'+(error?' error':'');}
function lifeEduStripOcrContact_(text){return String(text||'').replace(/聯絡(?:方法|資料)\s*[:：][\s\S]*?(?=姓名\s*[:：]|$)/gi,'〔聯絡資料略〕 ').replace(/\b(?:\d[\s-]?){7}\d\b/g,'〔電話號碼略〕');}
function lifeEduGroupOcrPageRows_(pages){
  var byPage={},groups={},unresolved=0,conflicted=0,oversized=0,namesByStudent={},conflictedStudents={},rosterClasses=[];
  LIFE_EDU_STATE.rows.forEach(function(row){var name=String(row.className||'').trim();if(name&&rosterClasses.indexOf(name)<0)rosterClasses.push(name);});
  (pages||[]).forEach(function(raw,index){if(!raw||typeof raw!=='object')return;var p=Number(raw.page);var key=Number.isInteger(p)&&p>0?String(p):'row-'+index;byPage[key]=raw;});
  function pageClass_(page){var value=String(page.className||page.class||page.classLabel||'').trim();if(!value&&rosterClasses.length===1)value=rosterClasses[0];return value;}
  function studentKey_(page){var raw=String(page.classNumber==null?'':page.classNumber).trim(),className=pageClass_(page);if(!className||!/^[1-9]\d{0,2}$/.test(raw))return '';return className+'-'+('0'+Number(raw)).slice(-2);}
  Object.keys(byPage).forEach(function(key){var p=byPage[key],id=studentKey_(p),name=String(p.studentName||'').trim().replace(/\s+/g,'');if(!id||!name||/^(無法辨認|手寫姓名無法辨認|未能辨認|不明|\?+|[-—]+)$/i.test(name))return;if(!namesByStudent[id])namesByStudent[id]=[];if(namesByStudent[id].indexOf(name)<0)namesByStudent[id].push(name);});
  Object.keys(namesByStudent).forEach(function(id){if(namesByStudent[id].length>1)conflictedStudents[id]=true;});
  Object.keys(byPage).sort(function(a,b){var an=Number(a),bn=Number(b);if(Number.isNaN(an))return 1;if(Number.isNaN(bn))return -1;return an-bn;}).forEach(function(key){var p=byPage[key],id=studentKey_(p);if(!id){unresolved++;return;}if(conflictedStudents[id]){conflicted++;return;}var n=Number(p.classNumber),className=pageClass_(p);if(!groups[id])groups[id]={id:id,className:className,classNumber:n,pages:[],names:[],teachers:[],schools:[],notes:[]};var g=groups[id];g.pages.push({page:Number(p.page)||0,text:lifeEduStripOcrContact_(p.ocrText||'')});[['studentName',g.names],['teacherName',g.teachers],['primarySchool',g.schools]].forEach(function(pair){var v=String(p[pair[0]]||'').trim();if(v&&pair[1].indexOf(v)<0)pair[1].push(v);});if(p.uncertainNotes)g.notes.push(String(p.uncertainNotes));});
  var rows=Object.keys(groups).sort(function(a,b){var left=groups[a],right=groups[b];return left.className.localeCompare(right.className,'zh-Hant')||left.classNumber-right.classNumber;}).map(function(id){var g=groups[id],pageNums=g.pages.map(function(p){return p.page;}).filter(Boolean);var source=g.pages.map(function(p){return '〔OCR'+(p.page?' 第'+p.page+'頁':'')+'〕\n'+p.text;}).filter(function(s){return s.trim();}).join('\n\n');var candidateNotes=['OCR候選；正式身份及文章未覆核。','來源頁碼：'+(pageNums.join('、')||'未標示')].concat(g.notes);return {id:g.id,className:g.className,classNumber:g.classNumber,ocrStudentName:g.names.join('／').slice(0,100),ocrTeacherName:g.teachers.join('／').slice(0,120),ocrPrimarySchool:g.schools.join('／').slice(0,160),sourceOcrText:source,scannedSheets:g.pages.length,reviewStatus:'待身份核對',ocrNote:candidateNotes.join('；').slice(0,500)};}).filter(function(row){if(row.sourceOcrText.length>2800){oversized+=row.scannedSheets;return false;}return true;});
  return {rows:rows,unresolved:unresolved,conflicted:conflicted,oversized:oversized};
}
function lifeEduNormalizeImportRow_(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))raw={};
  var headings={className:['班別','班級','class'],classNumber:['班號','班內編號','classNo','number'],studentNumber:['正式學號','學號','studentId','studentNumber'],nameZh:['中文姓名OCR','中文姓名','姓名','nameZh'],nameEn:['英文姓名','English Name','nameEn'],gender:['性別','gender'],house:['社別','社','house'],primarySchool:['所屬小學','小學','primarySchool'],ocrStudentName:['OCR姓名候選','ocrStudentName'],ocrTeacherName:['OCR老師候選','ocrTeacherName'],ocrPrimarySchool:['OCR小學候選','ocrPrimarySchool'],teacherName:['收件老師','老師姓名','teacherName'],teacherTitle:['老師職銜','職銜','teacherTitle'],expectedSheets:['應交張數','應交','expectedSheets'],physicalReceived:['紙本已收張數','紙本已收','已收張數','physicalReceived'],scannedSheets:['掃描頁數','掃描頁','scannedSheets'],teacherNote:['批改備註','老師批改備註','teacherNote'],ocrNote:['OCR疑點','OCR／姓名核對記錄','ocrNote'],sourceUrl:['原稿連結','來源掃描連結','sourceUrl'],sourceOcrText:['原始OCR','原始 OCR','sourceOcrText'],verifiedOcrText:['核對後OCR','核對後 OCR','verifiedOcrText'],correctedText:['老師修訂稿','修訂稿','correctedText'],reviewStatus:['文章狀態','reviewStatus'],exempt:['免交','豁免','exempt'],checkSpelling:['錯字已核對','checkSpelling'],checkFlow:['文句已核對','checkFlow'],checkFormat:['格式已核對','checkFormat'],studentFollowup:['待學生澄清','studentFollowup']};
  var row={};Object.keys(headings).concat(['id','updatedAt','updatedBy']).forEach(function(key){if(Object.prototype.hasOwnProperty.call(raw,key))row[key]=raw[key];});Object.keys(headings).forEach(function(key){if(row[key]!==undefined)return;for(var i=0;i<headings[key].length;i++){if(Object.prototype.hasOwnProperty.call(raw,headings[key][i])){row[key]=raw[headings[key][i]];break;}}});
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
  var unresolved=Number(warnings&&warnings.unresolved)||0,conflicted=Number(warnings&&warnings.conflicted)||0,oversized=Number(warnings&&warnings.oversized)||0;
  var textKeys=['sourceOcrText','verifiedOcrText','correctedText'],conflicts=[];
  rows.forEach(function(incoming){var normalized=lifeEduNormalizeImportRow_(incoming),current=LIFE_EDU_STATE.savedRows.filter(function(r){return String(r.className||'').trim()===String(normalized.className||'').trim()&&Number(r.classNumber)===Number(normalized.classNumber);})[0];if(!current)return;textKeys.forEach(function(key){if(incoming[key]!==undefined&&current[key]&&String(incoming[key])!==String(current[key]))conflicts.push(String(normalized.className||'')+' 第'+incoming.classNumber+'號 '+key);});});
  if(conflicts.length&&!window.confirm('匯入會覆蓋現有文章文字（'+conflicts.length+'項），例如 '+conflicts.slice(0,4).join('、')+'。已先匯出 JSON 備份嗎？確定繼續？')){lifeEduSetImportMessage_(messageNode,'已取消匯入；現有文章保留。',false);return;}
  var merged=lifeEduClone_(LIFE_EDU_STATE.savedRows),updated=0;
  try{
    rows.forEach(function(raw){var incoming=lifeEduNormalizeImportRow_(raw),number=Number(incoming.classNumber),className=String(incoming.className||'').trim();if(!className||!Number.isInteger(number)||number<1||number>999)throw new Error('每列必須有班別和 1 至 999 的班號；未能辨認的 OCR 頁請逐頁選取學生後貼入。');incoming.className=className;incoming.classNumber=number;incoming.id=incoming.id||className+'-'+('0'+number).slice(-2);var index=merged.findIndex(function(item){return item.id===incoming.id||(String(item.className||'').trim()===className&&Number(item.classNumber)===number);});if(index<0){var initial={id:incoming.id,className:className,classNumber:number,expectedSheets:'',physicalReceived:'',scannedSheets:'',reviewStatus:'待身份核對',exempt:false};merged.push(Object.assign(initial,incoming));}else{var next=Object.assign({},merged[index]);Object.keys(incoming).forEach(function(key){var value=incoming[key];if(value!==undefined&&value!==null&&value!=='')next[key]=value;});merged[index]=next;}updated++;});
    merged.sort(function(a,b){return String(a.className||'').localeCompare(String(b.className||''),'zh-Hant')||Number(a.classNumber)-Number(b.classNumber);});
    LIFE_EDU_STATE.rows=merged;LIFE_EDU_STATE.savedRows=lifeEduClone_(merged);LIFE_EDU_STATE.dirty=false;LIFE_EDU_STATE.importing=false;
    if(!LIFE_EDU_STATE.rows.some(function(r){return r.id===LIFE_EDU_STATE.selectedId;}))LIFE_EDU_STATE.selectedId=LIFE_EDU_STATE.rows[0]&&LIFE_EDU_STATE.rows[0].id||'';
    if(!lifeEduPersistLocal_())throw new Error('本機記錄無法保存；請先匯出 JSON 備份。');
    var detailsText=[];if(unresolved)detailsText.push('另有 '+unresolved+' 頁缺少可用班號，未自動配對，請逐頁核實');if(conflicted)detailsText.push(conflicted+' 頁因同一候選班號出現不同姓名而未合併，請逐頁核實');if(oversized)detailsText.push(oversized+' 頁因合併後超過2,800字而未匯入');var msg='已合併 '+updated+' 列；未列出的學生資料保留。'+(detailsText.length?'；'+detailsText.join('；'):'');lifeEduSetImportMessage_(messageNode,msg,false);lifeEduRender_();var details=document.getElementById('leImportPanel');if(details)details.open=true;lifeEduToast_(msg);
  }catch(error){LIFE_EDU_STATE.importing=false;lifeEduSetImportMessage_(messageNode,error.message||'匯入失敗。',true);}
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
  var textarea=document.getElementById('leOcrPaste'),append=document.getElementById('leOcrAppend'),note=document.getElementById('leOcrNote'),source=document.getElementById('leSourceOcr'),verified=document.getElementById('leVerifiedOcr'),status=document.getElementById('leMiniMaxStatus');var row=lifeEduSelected_();if(!row){if(status)status.textContent='請先選擇學生。';return;}
  try{var parsed=lifeEduParseOcrPaste_(textarea&&textarea.value),rawNumber=String(parsed.classNumber==null?'':parsed.classNumber).trim(),validNumber=/^\d{1,2}$/.test(rawNumber)?Number(rawNumber):0;if(validNumber&&validNumber!==Number(row.classNumber))throw new Error('OCR 顯示班號 '+validNumber+'，目前所選是第'+row.classNumber+'號。請切換到相符學生後再貼入。');
    var text=lifeEduStripOcrContact_(parsed.ocrText||parsed.text||'').trim();if(!text)throw new Error('JSON 中沒有文章 OCR 文字。');if(text.length>2800)throw new Error('OCR 文字超過2,800字，請分頁貼入。');
    var existingSource=source.value||'',existingVerified=verified.value||'';if(!append.checked&&(existingSource||existingVerified)&&!window.confirm('這位學生已有 OCR 文字；確定以新 OCR 覆蓋原始 OCR 與核對工作稿？'))return;
    var join=function(oldText,newText){return append.checked&&oldText?oldText+'\n\n〔續頁／OCR追加〕\n'+newText:newText;};source.value=join(existingSource,text);verified.value=join(existingVerified,text);
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
  LIFE_EDU_STATE.templateBytes=buffer;LIFE_EDU_STATE.templateName=name||'Word 範本';LIFE_EDU_STATE.lastTemplateTagNames=[];
  var xml=zip.file('word/document.xml');if(xml){var matches=xml.asText().match(/\{[^{}]+\}/g)||[];LIFE_EDU_STATE.lastTemplateTagNames=matches.map(function(tag){return tag.slice(1,-1).trim();});}
  var output=document.getElementById('leTemplateName');if(output)output.textContent=LIFE_EDU_STATE.templateName;lifeEduPersistLocal_();
  var message=document.getElementById('leImportMessage');lifeEduSetImportMessage_(message,'已載入範本：'+LIFE_EDU_STATE.templateName+(LIFE_EDU_STATE.lastTemplateTagNames.length?'（讀到 '+LIFE_EDU_STATE.lastTemplateTagNames.length+' 個欄位標記）':'（尚未讀到 {欄位標記}）'),!LIFE_EDU_STATE.lastTemplateTagNames.length);
  lifeEduRefreshPreviews_();return doc;
}
function lifeEduUseDefaultTemplate_(){
  try{var binary=atob(window.LIFE_EDU_DEFAULT_TEMPLATE_B64||'');if(!binary)throw new Error('預設範本未載入。');var bytes=new Uint8Array(binary.length);for(var i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);lifeEduSetTemplate_(bytes.buffer,'預設感恩卡範本.docx');lifeEduToast_('已載入預設範本。');}catch(error){lifeEduToast_(error.message||'未能載入預設範本。',true);}
}
function lifeEduDownloadDefaultTemplate_(){
  try{var binary=atob(window.LIFE_EDU_DEFAULT_TEMPLATE_B64||'');if(!binary)throw new Error('預設範本未載入。');var bytes=new Uint8Array(binary.length);for(var i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);lifeEduDownload_(new Blob([bytes],{type:LIFE_EDU_WORD_MIME}),'謝師恩感恩卡_Word範本.docx');}catch(error){lifeEduToast_(error.message||'未能下載範本。',true);}
}
function lifeEduTemplateData_(row){
  var text=row.correctedText||row.verifiedOcrText||'';
  return {activityTitle:(LIFE_EDU_STATE.meta||{}).title||'箋紙濃情謝師恩',year:'2026',className:row.className||'',classNumber:String(row.classNumber||''),studentName:row.nameZh||'',studentNameEn:row.nameEn||'',studentNumber:row.studentNumber||'',primarySchool:row.primarySchool||'',teacherName:row.teacherName||'',teacherTitle:row.teacherTitle||'',teacherDisplay:(row.teacherName||'')+(row.teacherTitle||''),correctedText:text,articleText:text,verifiedOcrText:row.verifiedOcrText||'',sourceOcrText:row.sourceOcrText||'',fontSizePt:String(LIFE_EDU_STATE.fontSize)};
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
  var area=document.getElementById('leWordPreview');if(!area)return;if(LIFE_EDU_STATE.dirty)lifeEduApplyFormToRow_();
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

lifeEduStart_();
