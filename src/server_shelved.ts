//import {Request} from "express";
//import {MimeBundler, MimeTextFragment} from "./shared/mime";

class Server_shelved {
    /*

        async mainUserDataFragment(req: Request): Promise<MimeTextFragment[]> {
            return [await this.includePartHandler(req), await this.mainCloudConfigIncludeFragment(req)];
        }

        async fun () {
            // the same again as above, but with a placeholder for key=value pairs just like a querystring.
            app.get("/:owner/:repo/:commitish/:recipes/params/:defaults/dsnocloud/user-data", async (req, res) => {
                if (true) {
                    let main = await this.mainCloudConfigIncludeFragment(req);
                    return res.status(200).contentType("text/plain").send(main.body);
                } else {
                    return await (new MimeBundler([...await this.mainUserDataFragment(req)])).render(res);
                }
            });

        }


        private async includePartHandler(req: Request): Promise<MimeTextFragment> {
            let body: string = ``;
            body += `#part-handler
    # vi: syntax=python ts=4
    # this is an example of a version 2 part handler.
    # the differences between the initial part-handler version
    # and v2 is:
    #  * handle_part receives a 5th argument, 'frequency'
    #    frequency will be either 'always' or 'per-instance'
    #  * handler_version must be set
    #
    # A handler declaring version 2 will be called on all instance boots, with a
    # different 'frequency' argument.

    handler_version = 2
    def list_types():
        # return a list of mime-types that are handled by this module
        return(["text/templated-x-include-url"])

    def handle_part(data,ctype,filename,payload,frequency):
        # data: the cloudinit object
        # ctype: '__begin__', '__end__', or the specific mime-type of the part
        # filename: the filename for the part, or dynamically generated part if
        #           no filename is given attribute is present
        # payload: the content of the part (empty for begin or end)
        # frequency: the frequency that this cloud-init run is running for
        #            this is either 'per-instance' or 'always'.  'per-instance'
        #            will be invoked only on the first boot.  'always' will
        #            will be called on subsequent boots.
        if ctype == "__begin__":
           print("my handler is beginning, frequency=%s" % frequency)
           return
        if ctype == "__end__":
           print("my handler is ending, frequency=%s" % frequency)
           return

        print("==== received ctype=%s filename=%s ====" % (ctype,filename))
        print(data)
        print(payload)
        print("==== end ctype=%s filename=%s" % (ctype, filename))
        `;
            //body += "---\n#cloud-config\nhostname: \"really.down.here\"\n";
            return new MimeTextFragment("text/part-handler", "xincluded.py", body);
            //return new MimeTextFragment("text/cloud-config", "another.yaml", body);
        }

    */

}
