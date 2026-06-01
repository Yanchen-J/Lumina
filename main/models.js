// 扫描 models/ 目录，发现所有可用 Live2D 模型并读取每个的 pet.config.json
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const DEFAULT_CONFIG = {
  displayName: '',
  personality: '你是一个可爱的桌面伙伴。回复要简短温柔，多用颜文字，称对方为「主人」，全部用中文。',
  memoryFocus: '',
  birthday: '',          // 'MM-DD'，如 '09-30'。设置后启动时自动注册成纪念日
  scaleFactor: 1.0,
  verticalOffset: 0,
  hairOffset: 50,        // 气泡箭头距模型 bounding box 顶部偏移
  windowWidth: 380,      // 桌宠窗口宽度
  windowHeight: 600,     // 桌宠窗口高度
  voiceEnabled: false,   // 默认不放语音，需要在配置里显式打开
  lines: null,           // 每角色台词库覆盖；null 用默认。结构 { greet, tap, enterWorking, ... }
};

function scan(modelsDir) {
  const out = [];
  if (!fs.existsSync(modelsDir)) return out;
  for (const name of fs.readdirSync(modelsDir)) {
    const dir = path.join(modelsDir, name);
    let stat;
    try { stat = fs.statSync(dir); } catch (e) { continue; }
    if (!stat.isDirectory()) continue;
    const files = fs.readdirSync(dir);
    // 优先 Cubism 4 (.model3.json)，回退 Cubism 2 (model.json / *.model.json)
    let modelFile = files.find(f => f.endsWith('.model3.json'));
    if (!modelFile) modelFile = files.find(f => f === 'model.json' || /\.model\.json$/.test(f));
    if (!modelFile) continue;

    let config = { ...DEFAULT_CONFIG, displayName: name };
    const cfgPath = path.join(dir, 'pet.config.json');
    if (fs.existsSync(cfgPath)) {
      try {
        const userCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
        config = { ...config, ...userCfg };
      } catch (e) {
        console.warn('[models] 配置解析失败:', cfgPath, e.message);
      }
    }
    const modelAbs = path.join(dir, modelFile);
    out.push({
      id: name,
      url: pathToFileURL(modelAbs).href,
      config,
    });
  }
  return out;
}

// 写回某个角色 pet.config.json 的部分字段（合并不覆盖未传字段）
// 设置 UI 用，patch 形如 { personality, memoryFocus }
function updateConfig(modelsDir, modelId, patch) {
  const dir = path.join(modelsDir, modelId);
  if (!fs.existsSync(dir)) throw new Error('角色目录不存在: ' + modelId);
  const cfgPath = path.join(dir, 'pet.config.json');
  let current = {};
  if (fs.existsSync(cfgPath)) {
    try { current = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')); }
    catch (e) { throw new Error('原配置 JSON 解析失败：' + e.message); }
  }
  // 仅允许修改的字段白名单（避免用户从设置 UI 误改 scaleFactor 等渲染参数）
  const ALLOWED = ['personality', 'memoryFocus', 'displayName'];
  const next = { ...current };
  for (const key of ALLOWED) {
    if (patch[key] !== undefined) next[key] = patch[key];
  }
  fs.writeFileSync(cfgPath, JSON.stringify(next, null, 2));
  return next;
}

// 重置某个角色的 personality / memoryFocus 为默认（删除字段，让 scan 时回退到默认）
function resetPersonality(modelsDir, modelId) {
  const cfgPath = path.join(modelsDir, modelId, 'pet.config.json');
  if (!fs.existsSync(cfgPath)) return null;
  let current;
  try { current = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')); }
  catch (e) { throw new Error('原配置解析失败：' + e.message); }
  delete current.personality;
  delete current.memoryFocus;
  fs.writeFileSync(cfgPath, JSON.stringify(current, null, 2));
  return current;
}

module.exports = { scan, updateConfig, resetPersonality, DEFAULT_CONFIG };
