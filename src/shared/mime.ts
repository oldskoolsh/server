import {Response} from "express";

export class MimeBundler {

    private readonly fragments: MimeTextFragment[];
    private readonly boundary: string;

    constructor(fragments: MimeTextFragment[]) {
        this.fragments = fragments;
        let boundary = '===============';
        for (let i = 0; i < 24; i++) {
            boundary += Math.floor(Math.random() * 10).toString(16);
        }
        this.boundary = boundary + "==";
    }

    // embarrassing to have to write this code in 2020. really JS ecosystem...?
    async render(res: Response) {
        let type = `multipart/mixed; boundary="${this.boundary}"`;

        let body = "";
        body += `Content-Type: ${type}\n`;
        body += `MIME-Version: 1.0\n`;
        body += `Number-Attachments: ${this.fragments.length}\n\n`;
        body += `--${this.boundary}\n`;

        for (const fragment of this.fragments) {
            body += `Content-Type: ${fragment.type}; charset="utf-8"\n`;
            body += `MIME-Version: 1.0\n`;
            body += `Content-Transfer-Encoding: base64\n`;
            body += `Content-Disposition: attachment; filename="${fragment.filename}"\n`;
            body += `\n`;
            body += new Buffer(fragment.body).toString("base64") + "\n\n";
            body += `--${this.boundary}\n`;
        }

        res
            .set('MIME-Version', '1.0')
            .set('Content-type', type)
            .set('Number-Attachments', `${this.fragments.length}`)
            .status(200)
            .send(body);
    }

}


export class MimeTextFragment {

    private readonly _type: string;
    private readonly _filename: string;
    private readonly _body: string;

    constructor(type: string, filename: string, body: string) {
        this._type = type;
        this._body = body;
        this._filename = filename;
    }

    get type(): string {
        return this._type;
    }

    get filename(): string {
        return this._filename;
    }

    get body(): string {
        return this._body;
    }
}
