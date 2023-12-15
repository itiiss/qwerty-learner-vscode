import { dictionaries } from './resource/dictionary'
import { DictPickItem } from './typings/index'
import * as vscode from 'vscode'
import cet4 from './assets/CET4_T.json'
import { range } from 'lodash'
import { compareWord, getConfig, getDictFile } from './utils'
import { soundPlayer } from './sound'
import { voicePlayer } from './resource/voice'
import PluginState from './utils/PluginState'

export function activate(context: vscode.ExtensionContext) {
  const pluginState = new PluginState(context)

  const wordBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -100)
  const inputBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -101)
  const transBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -102)

  vscode.workspace.onDidChangeTextDocument((e) => {
    if (!pluginState.isStart) {
      return
    }

    const { uri } = e.document
    // 避免破坏配置文件
    if (uri.scheme.indexOf('vscode') !== -1) {
      return
    }

    const { range, text, rangeLength } = e.contentChanges[0]
    if (!(text !== '' && text.length === 1)) {
      return
    }
    // 删除用户输入的字符
    const newRange = new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character + 1)
    const editAction = new vscode.WorkspaceEdit()
    editAction.delete(uri, newRange)
    vscode.workspace.applyEdit(editAction)
    if (pluginState.hasWrong) {
      return
    }
    soundPlayer('click')
    inputBar.text = pluginState.getCurrentInputBarContent(text)

    const compareResult = pluginState.compareResult
    if (compareResult === -2) {
      // 用户完成单词输入
      soundPlayer('success')
      pluginState.finishWord()
      initializeBar(true)
    } else if (compareResult >= 0) {
      pluginState.wrongInput()
      inputBar.color = pluginState.highlightWrongColor
      soundPlayer('wrong')
      setTimeout(() => {
        pluginState.clearWrong()
        inputBar.color = undefined
        initializeBar(true)
      }, pluginState.highlightWrongDelay)
    }
  })

  vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('qwerty-learner.placeholder')) {
      pluginState.placeholder = getConfig('placeholder')
      initializeBar(true)
    }

    if (event.affectsConfiguration('qwerty-learner.chapterLength')) {
      pluginState.chapterLength = getConfig('chapterLength')
      initializeBar(true)
    }
  })

  // 注册 vscode commands
  context.subscriptions.push(
    ...[
      vscode.commands.registerCommand('qwerty-learner.start', () => {
        pluginState.isStart = !pluginState.isStart
        if (pluginState.isStart) {
          initializeBar(true)
          wordBar.show()
          inputBar.show()
          transBar.show()
          if (pluginState.readOnlyMode) {
            setUpReadOnlyInterval()
          }
        } else {
          wordBar.hide()
          inputBar.hide()
          transBar.hide()
          removeReadOnlyInterval()
          if (pluginState.enterKeyListener) {
            pluginState.enterKeyListener.dispose();
            pluginState.enterKeyListener = null;
          }
        }
      }),
      vscode.commands.registerCommand('qwerty-learner.changeChapter', async () => {
        const inputChapter = await vscode.window.showQuickPick(
          range(1, pluginState.totalChapters + 1).map((i) => i.toString()),
          { placeHolder: `当前章节: ${pluginState.chapter + 1}   共 ${pluginState.totalChapters}章节` },
        )
        if (inputChapter !== undefined) {
          pluginState.chapter = parseInt(inputChapter) - 1
          initializeBar(true)
        }
      }),
      vscode.commands.registerCommand('qwerty-learner.changeDict', async () => {
        const dictList: DictPickItem[] = []
        dictionaries.forEach((dict) => {
          dictList.push({ label: dict.name, path: dict.url, detail: dict.description, key: dict.id })
        })
        const inputDict = await vscode.window.showQuickPick(dictList, { placeHolder: `当前字典: ${pluginState.dict.name}` })
        if (inputDict !== undefined) {
          pluginState.dictKey = inputDict.key
          initializeBar(true)
        }
      }),
      vscode.commands.registerCommand('qwerty-learner.toggleWordVisibility', () => {
        pluginState.wordVisibility = !pluginState.wordVisibility
        initializeBar(true)
      }),
      vscode.commands.registerCommand('qwerty-learner.toggleReadOnlyMode', () => {
        pluginState.readOnlyMode = !pluginState.readOnlyMode
        if (pluginState.readOnlyMode) {
          setUpReadOnlyInterval()
        } else {
          removeReadOnlyInterval()
        }
      }),
    ],
  )

  function initializeBar(isShowTrans: boolean) {
    setUpWordBar();
    setUpInputBar();
  

    setUpTransBar(isShowTrans);
  }
  
  function setUpWordBar() {
    wordBar.text = pluginState.getInitialWordBarContent()
    if (pluginState.shouldPlayVoice) {
      pluginState.voiceLock = true
      voicePlayer(pluginState.currentWord.name, () => {
        pluginState.voiceLock = false
      })
    }
  }
  function setUpTransBar(isShowTrans: boolean) {
    if(isShowTrans) {
      transBar.text = pluginState.getInitialTransBarContent();
      transBar.show(); // 确保 transBar 被显示
    } else {
      transBar.text = '';
      transBar.show();
    }
  }
  function setUpInputBar() {
    inputBar.text = pluginState.getInitialInputBarContent()
  }

  // function setUpReadOnlyInterval() {
  //   if (!pluginState.readOnlyIntervalId) {
  //     pluginState.readOnlyIntervalId = setInterval(() => {
  //       pluginState.finishWord()
  //       initializeBar()
  //     }, pluginState.readOnlyInterval)
  //   }
  // }

  function setUpReadOnlyInterval() {
    pluginState.enterKeyListener = vscode.commands.registerCommand('type', (args) => {
      if (args.text === '\n') {
        pluginState.finishWord();
        initializeBar(false);
      }
      if (args.text === ' ' && pluginState.readOnlyMode) {
        setUpTransBar(true);
      }
    });
  

  
    // 添加到上下文订阅
    context.subscriptions.push(pluginState.enterKeyListener);
  }
  

  function removeReadOnlyInterval() {
    if (pluginState.readOnlyIntervalId) {
      clearInterval(pluginState.readOnlyIntervalId)
      pluginState.readOnlyIntervalId = null
    }
  }
}
