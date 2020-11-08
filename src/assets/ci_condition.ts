import {RenderingContext} from "./context";

export interface ICondition {

    evaluate(): Promise<Boolean>;
}

export class BaseCondition {
    protected readonly value: string;
    protected readonly context: RenderingContext;

    constructor(rc: RenderingContext, value: string) {
        this.context = rc;
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
