import {ApiProperty, PartialType} from "@nestjs/swagger";
import {BaseResponse} from "../../utils/utils.response";
import {TopRocInterface} from "../interfaces/top-roc-interface";


export class TopRocResponse {
    @ApiProperty({
        type: String,
        example: 'VCB'
    })
    ticker: string;

    @ApiProperty({
        type: Number,
        example: 65.5
    })
    ROC_5: number;


    constructor(data?: TopRocInterface) {
        this.ticker = data?.ticker || '';
        this.ROC_5 = data?.ROC_5 || 0;
    }

    public mapToList(data?: TopRocInterface[] | any[]) {
        return data.map(i => new TopRocResponse(i))
    }
}

export class TopRocSwagger extends PartialType(BaseResponse) {
    @ApiProperty({
        type: TopRocResponse,
        isArray: true,
    })
    data: TopRocResponse[];
}