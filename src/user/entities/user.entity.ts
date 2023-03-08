import {Column, Entity, Index, PrimaryGeneratedColumn} from 'typeorm';
import {BaseModel} from '../../models/base.entity';

@Entity({
  database: 'user',
  name: 'user',
})
export class UserEntity extends BaseModel {
  @PrimaryGeneratedColumn('increment', {
    type: 'int',
  })
  user_id: number;

  @Index()
  @Column({
    type: 'varchar',
    default: '',
  })
  email: string;

  @Column({
    type: 'varchar',
    default: '',
  })
  password: string;

  @Column({
    type: 'varchar',
    unique: true,
    default: '',
  })
  name: string;

  @Column({
    type: 'varchar',
    default: '',
  })
  avatar: string;

  @Column({
    type: 'date',
    default: '01/01/2000',
  })
  date_of_birth: Date;

  @Index()
  @Column({
    type: 'varchar',
    default: '',
  })
  phone: string;

  /**
   * Tài Khoản đã xác minh email hay chưa: 0 - chưa, 1 - rồi
   */
  @Column({
    type: 'smallint',
    default: 0,
  })
  is_verified: number;

  /**
   * Tài khoản có đăng ký nhận email khuyến mãi... hay không: 0 - không, 1 - có
   */
  @Column({
    type: 'smallint',
    default: 0,
  })
  is_receive_email: number;

  // @OneToOne(() => CityEntity)
  // @JoinColumn({
  //     referencedColumnName: 'city_id',
  //     name: 'city_id',
  // })
  // city: CityEntity;

  // @OneToOne(() => DistrictEntity)
  // @JoinColumn({
  //     name: 'district_id',
  //     referencedColumnName: 'district_id',
  // })
  // district: DistrictEntity;

  // @OneToOne(() => WardEntity)
  // @JoinColumn({
  //     name: 'ward_id',
  //     referencedColumnName: 'ward_id',
  // })
  // ward: WardEntity;

  @Column({
    type: 'varchar',
    default: '',
  })
  address: string;
}
