import {RenderingContext} from "./context";

export interface ICondition {

    evaluate(): Promise<Boolean>;
}

export class BaseCondition {
    protected readonly value: string;
    protected readonly rc: RenderingContext;

    constructor(rc: RenderingContext, value: string) {
        this.rc = rc;
        this.value = value;
    }
}

export class OSCondition extends BaseCondition implements ICondition {
    async evaluate(): Promise<Boolean> {
        if (this.value === "centos") return false;
        return true;
    }
}

export class ReleaseCondition extends BaseCondition implements ICondition {
    async evaluate(): Promise<Boolean> {
        return true;
    }
}
