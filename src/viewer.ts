'use strict'

import * as vscode from 'vscode'
import * as ws from 'ws'
import * as fs from 'fs'
import * as path from 'path'
import * as open from 'open'

import {Extension} from './main'

export class Viewer {
    extension: Extension
    clients = {}
    positions = {}

    constructor(extension: Extension) {
        this.extension = extension
    }

    refreshExistingViewer(sourceFile: string) : boolean {
        let pdfFile = this.extension.manager.tex2pdf(sourceFile)
        if (pdfFile in this.clients) {
            this.extension.logger.addLogMessage(`Refresh PDF viewer for ${pdfFile}`)
            this.clients[pdfFile].send(JSON.stringify({type: "refresh"}))
            return true
        }
        return false
    }

    checkViewer(sourceFile: string) : string {
        if (this.refreshExistingViewer(sourceFile))
            return
        let pdfFile = this.extension.manager.tex2pdf(sourceFile)
        if (!fs.existsSync(pdfFile)) {
            this.extension.logger.addLogMessage(`Cannot find PDF file ${pdfFile}`)
            return
        }
        if (this.extension.server.address === undefined) {
            this.extension.logger.addLogMessage(`Cannot establish server connection.`)
            return
        }
        return `http://${this.extension.server.address}/viewer.html?file="pdf:${encodeURIComponent(pdfFile)}`
    }

    openViewer(sourceFile: string) {
        let url = this.checkViewer(sourceFile)
        if (!url)
            return
        let pdfFile = this.extension.manager.tex2pdf(sourceFile)
        open(url)
        this.extension.logger.addLogMessage(`Open PDF viewer for ${pdfFile}`)
    }

    openTab(sourceFile: string) {
        let url = this.checkViewer(sourceFile)
        if (!url)
            return;
        let pdfFile = this.extension.manager.tex2pdf(sourceFile)
        let uri = vscode.Uri.file(pdfFile).with({scheme:'latex-workshop-pdf'})
        let column = vscode.ViewColumn.Two
        if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.viewColumn === vscode.ViewColumn.Two)
            column = vscode.ViewColumn.Three
        vscode.commands.executeCommand("vscode.previewHtml", uri, column, path.basename(pdfFile))
        this.extension.logger.addLogMessage(`Open PDF tab for ${pdfFile}`)
    }

    handler(ws: object, msg: string) {
        let data = JSON.parse(msg)
        switch (data.type) {
            case 'open':
                this.clients[decodeURIComponent(data.path)] = ws
                break
            case 'close':
                for (let key in this.clients)
                    if (this.clients[key] == ws)
                        delete this.clients[key]
                        break
            case 'position':
                for (let key in this.clients)
                    if (this.clients[key] == ws)
                        this.positions[key] = data
                        break
            case 'loaded':
                let pdfFile = decodeURIComponent(data.path)
                if (pdfFile in this.clients && pdfFile in this.positions)
                    this.clients[pdfFile].send(JSON.stringify(this.positions[pdfFile]))
                break
            case 'click':
                this.extension.locator.locate(data, decodeURIComponent(data.path))
                break
            default:
                this.extension.logger.addLogMessage(`Unknown websocket message: ${msg}`)
                break
        }
    }

    syncTeX(pdfFile: string, record: object) {
        if (!(pdfFile in this.clients)) {
            this.extension.logger.addLogMessage(`PDF is not viewed: ${pdfFile}`)
            return
        }
        this.clients[pdfFile].send(JSON.stringify({type: "synctex", data: record}))
        this.extension.logger.addLogMessage(`Try to synctex ${pdfFile}`)
    }
}

export class PDFProvider implements vscode.TextDocumentContentProvider {
    extension: Extension

    constructor(extension: Extension) {
        this.extension = extension
    }

    public provideTextDocumentContent(uri: vscode.Uri): string {
        let url = `http://${this.extension.server.address}/viewer.html?file=\\pdf:${encodeURIComponent(uri.fsPath)}`
        return `
            <!DOCTYPE html style="position:absolute; left: 0; top: 0; width: 100%; height: 100%;"><html><head></head>
            <body style="position:absolute; left: 0; top: 0; width: 100%; height: 100%;">
            <iframe class="preview-panel" src="${url}" style="position:absolute; border: none; left: 0; top: 0; width: 100%; height: 100%;">
            </iframe></body></html>
        `
	}
}