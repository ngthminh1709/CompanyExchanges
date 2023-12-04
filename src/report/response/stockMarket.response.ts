import { ApiProperty } from "@nestjs/swagger"

export class StockMarketResponse {
    @ApiProperty({
        type: String
    })
    name: string

    @ApiProperty({
        type: Number
    })
    price: number

    @ApiProperty({
        type: Number
    })
    day: number

    @ApiProperty({
        type: Number
    })
    month: number

    @ApiProperty({
        type: Number
    })
    year: number

    @ApiProperty({
        type: Number
    })
    ytd: number

    code: string

    constructor(data?: StockMarketResponse) {
        this.name = data?.code || ''
        this.price = data?.price || 0
        this.day = +data?.day.toFixed(2) || 0
        this.month = +data?.month.toFixed(2) || 0
        this.year = +data?.year.toFixed(2) || 0
        this.ytd = +data?.ytd.toFixed(2) || 0
    }

    static mapToList(data?: StockMarketResponse[]) {
        return data.map(item => new StockMarketResponse(item))
    }
}